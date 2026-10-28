import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { verifyStripeSignature, type CheckoutSession } from "@/lib/server/stripe";
import { fulfilSession } from "@/lib/server/payments";
import { recordError } from "@/lib/server/error-log";

export const dynamic = "force-dynamic";

/** Stripe webhook: upgrades events when a Checkout payment completes. */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Webhook secret not set", { status: 500 });
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return new Response("Bad signature", { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { object: CheckoutSession } };
  const session = event.data.object;

  // Refunds (full or partial) and disputes. A full refund or a dispute also takes back
  // anything not used yet (unused pack events, the referral reward it earned).
  if (event.type === "charge.refunded") {
    const charge = event.data.object as unknown as { payment_intent: string | null; refunded: boolean; amount_refunded: number };
    if (charge.payment_intent) {
      const { error } = await admin().rpc("record_payment_refund", {
        p_payment_intent: charge.payment_intent,
        p_refunded_cents: charge.amount_refunded ?? 0,
        p_full: !!charge.refunded,
      });
      if (error) return new Response("Refund update failed", { status: 500 });
    }
    return Response.json({ received: true });
  }
  if (event.type === "charge.dispute.created") {
    const dispute = event.data.object as unknown as { payment_intent: string | null; amount: number };
    if (dispute.payment_intent) {
      const { error } = await admin().rpc("record_payment_refund", {
        p_payment_intent: dispute.payment_intent,
        p_refunded_cents: 0,
        p_full: false,
        p_dispute: true,
      });
      if (error) return new Response("Dispute update failed", { status: 500 });
      await recordError({ source: "server", message: `Card dispute opened on ${dispute.payment_intent}. Respond in Stripe.`, path: "/api/stripe/webhook" }).catch(() => {});
    }
    return Response.json({ received: true });
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const res = await fulfilSession(session);
      // Unknown sessions (not created by this app) are acknowledged so Stripe stops retrying.
      if (!res.ok && res.reason !== "unpaid" && !res.reason.includes("payment_not_found")) {
        return new Response("Fulfilment failed", { status: 500 });
      }
      break;
    }
    case "checkout.session.async_payment_failed":
      await admin().from("payments").update({ status: "failed" }).eq("stripe_session_id", session.id).eq("status", "pending");
      break;
    case "checkout.session.expired":
      await admin().from("payments").update({ status: "expired" }).eq("stripe_session_id", session.id).eq("status", "pending");
      break;
  }
  return Response.json({ received: true });
}
