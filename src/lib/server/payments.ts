import "server-only";
import { admin } from "@/lib/supabase/admin";
import { copyAccountLogo } from "@/lib/server/branding";
import { notifySetupCall } from "@/lib/server/setup-call";
import { expireCheckoutSession, getCheckoutSession, type CheckoutSession } from "@/lib/server/stripe";
import { recordError } from "@/lib/server/error-log";

/**
 * Marks a paid Checkout session as paid and upgrades its event. Safe to call
 * from both the webhook and the success page.
 */
export async function fulfilSession(session: CheckoutSession) {
  if (session.payment_status !== "paid") return { ok: false as const, reason: "unpaid" };
  // Side effects (emails, logo copy) run only the first time a payment is fulfilled,
  // not on every webhook retry or success-page reload.
  const { data: before } = await admin().from("payments").select("status").eq("stripe_session_id", session.id).maybeSingle();
  const firstTime = before?.status === "pending";
  const { data, error } = await admin().rpc("fulfil_payment", {
    p_session_id: session.id,
    p_payment_intent: session.payment_intent,
    p_email: session.customer_details?.email ?? null,
  });
  if (error) return { ok: false as const, reason: error.message };
  if (!firstTime || data?.status !== "paid") return { ok: true as const, payment: data };
  if (typeof session.amount_total === "number") {
    await admin().from("payments").update({ charged_cents: session.amount_total }).eq("id", data.id);
  }
  if (data.kind !== "pack" && !data.event_id) {
    await recordError({
      source: "server",
      message: `Paid for an event that no longer exists (payment ${data.id}). Check whether to refund.`,
      path: "/api/stripe/webhook",
    }).catch(() => {});
  }
  // Customers who came through a venue stay linked to it for later orders.
  if (data?.partner_id && data.user_id) {
    await admin().from("profiles").update({ partner_id: data.partner_id }).eq("id", data.user_id).is("partner_id", null);
  }
  if (data?.event_id && data.user_id && (data.addon === "branding" || data.addons?.includes("branding"))) {
    await copyAccountLogo(data.user_id, data.event_id).catch(() => {});
  }
  if (data?.event_id && data.user_id && (data.addon === "setup" || data.addons?.includes("setup"))) {
    await notifySetupCall(data.id, data.event_id, data.user_id).catch((e) => console.error("setup call email failed", e));
  }
  return { ok: true as const, payment: data };
}

/** For the success page: looks the session up at Stripe rather than trusting the URL. */
export async function confirmSession(sessionId: string, eventId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false as const, reason: "bad_id" };
  const session = await getCheckoutSession(sessionId);
  if (session.metadata?.event_id !== eventId) return { ok: false as const, reason: "wrong_event" };
  return fulfilSession(session);
}

/** For the packs page: the session must belong to this organiser. */
export async function confirmPackSession(sessionId: string, userId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false as const, reason: "bad_id" };
  const session = await getCheckoutSession(sessionId);
  if (session.metadata?.user_id !== userId || session.metadata?.kind !== "pack") return { ok: false as const, reason: "wrong_user" };
  return fulfilSession(session);
}

/**
 * Closes earlier unpaid checkouts for the same event (or the same organiser's packs),
 * so an old tab can't be paid as well. Leaves very recent ones alone so a double
 * click still returns the same session.
 */
export async function closeOlderCheckouts(filter: { eventId?: string; userId?: string; kind?: "pack" }) {
  const db = admin();
  let q = db
    .from("payments")
    .select("id, stripe_session_id")
    .eq("status", "pending")
    .lt("created_at", new Date(Date.now() - 60_000).toISOString())
    .gt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if (filter.eventId) q = q.eq("event_id", filter.eventId);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.kind) q = q.eq("kind", filter.kind);
  const { data } = await q.limit(10);
  for (const p of data ?? []) {
    if (await expireCheckoutSession(p.stripe_session_id)) {
      await db.from("payments").update({ status: "expired" }).eq("id", p.id).eq("status", "pending");
    }
  }
}
