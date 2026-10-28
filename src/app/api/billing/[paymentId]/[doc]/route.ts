import type { NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getBillingDocs, stripeConfigured } from "@/lib/server/stripe";
import { jsonError } from "@/lib/server/http";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Sends the organiser to Stripe's invoice page, invoice PDF or card receipt for one of their payments. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/billing/[paymentId]/[doc]">) {
  const { paymentId, doc } = await ctx.params;
  if (!UUID_RE.test(paymentId) || !["invoice", "pdf", "receipt"].includes(doc)) return jsonError(404, "not_found", "Not found.");
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorised", "Sign in first.");
  if (!stripeConfigured()) return jsonError(503, "unavailable", "Billing isn't set up.");

  // RLS: only payments the user made or for events they organise.
  const { data: pay } = await supabase
    .from("payments")
    .select("stripe_session_id, status")
    .eq("id", paymentId)
    .in("status", ["paid", "refunded"])
    .maybeSingle();
  if (!pay) return jsonError(404, "not_found", "Payment not found.");

  try {
    const docs = await getBillingDocs(pay.stripe_session_id);
    const url = doc === "invoice" ? docs.invoiceUrl : doc === "pdf" ? docs.invoicePdf : docs.receiptUrl;
    if (!url) return jsonError(404, "not_found", "Stripe doesn't have that document for this payment.");
    return Response.redirect(url, 302);
  } catch (e) {
    console.error("billing doc failed", e);
    return jsonError(502, "stripe_error", "Couldn't reach Stripe. Try again in a minute.");
  }
}
