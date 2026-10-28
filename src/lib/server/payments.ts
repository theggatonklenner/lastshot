import "server-only";
import { admin } from "@/lib/supabase/admin";
import { copyAccountLogo } from "@/lib/server/branding";
import { notifySetupCall } from "@/lib/server/setup-call";
import { getCheckoutSession, type CheckoutSession } from "@/lib/server/stripe";

/**
 * Marks a paid Checkout session as paid and upgrades its event. Safe to call
 * from both the webhook and the success page.
 */
export async function fulfilSession(session: CheckoutSession) {
  if (session.payment_status !== "paid") return { ok: false as const, reason: "unpaid" };
  const { data, error } = await admin().rpc("fulfil_payment", {
    p_session_id: session.id,
    p_payment_intent: session.payment_intent,
    p_email: session.customer_details?.email ?? null,
  });
  if (error) return { ok: false as const, reason: error.message };
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
