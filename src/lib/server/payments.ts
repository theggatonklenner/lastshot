import "server-only";
import { admin } from "@/lib/supabase/admin";
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
  return { ok: true as const, payment: data };
}

/** For the success page: looks the session up at Stripe rather than trusting the URL. */
export async function confirmSession(sessionId: string, eventId: string) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false as const, reason: "bad_id" };
  const session = await getCheckoutSession(sessionId);
  if (session.metadata?.event_id !== eventId) return { ok: false as const, reason: "wrong_event" };
  return fulfilSession(session);
}
