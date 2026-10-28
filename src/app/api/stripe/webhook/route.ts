import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { verifyStripeSignature, type CheckoutSession } from "@/lib/server/stripe";
import { fulfilSession } from "@/lib/server/payments";

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
    case "checkout.session.expired":
      await admin().from("payments").update({ status: "expired" }).eq("stripe_session_id", session.id).eq("status", "pending");
      break;
  }
  return Response.json({ received: true });
}
