import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe tax category for every product: "General - Electronically Supplied
 * Services". Required when Stripe Managed Payments is on, harmless otherwise.
 */
const TAX_CODE = process.env.STRIPE_TAX_CODE || "txcd_10000000";

/** Minimal Stripe client over fetch (Checkout + webhooks only). */

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function stripeTestMode() {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

/** Flattens nested params into Stripe's form encoding (a[b][0][c]=...). */
function encode(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    // Stripe treats "" as "unset this field" and rejects it when creating things.
    if (v === undefined || v === null || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => encodeValue(`${key}[${i}]`, item, out));
    else encodeValue(key, v, out);
  }
  return out;
}

function encodeValue(key: string, v: unknown, out: URLSearchParams) {
  if (v !== null && typeof v === "object") encode(v as Record<string, unknown>, key, out);
  else out.append(key, String(v));
}

async function stripe<T>(method: "GET" | "POST", path: string, params?: Record<string, unknown>, idempotencyKey?: string) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe isn't set up (STRIPE_SECRET_KEY).");
  const qs = method === "GET" && params ? `?${encode(params)}` : "";
  const form = method === "POST" && params ? encode(params).toString() : undefined;
  // Tie the idempotency key to the exact request, so a changed order never collides with an earlier attempt.
  const idemKey = idempotencyKey && form ? `${idempotencyKey}:${createHash("sha256").update(form).digest("hex").slice(0, 16)}` : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${path}${qs}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idemKey ? { "Idempotency-Key": idemKey } : {}),
    },
    body: form,
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${json?.error?.message ?? "request failed"}`);
  return json as T;
}

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: "open" | "complete" | "expired";
  payment_intent: string | null;
  amount_total?: number | null;
  customer_details?: { email?: string | null } | null;
  metadata?: Record<string, string>;
};

export type CheckoutItem = { amountCents: number; name: string; description?: string };

export function createCheckoutSession(p: {
  /** One line item (amountCents/productName/description) or several (items). */
  amountCents?: number;
  productName?: string;
  description: string;
  items?: CheckoutItem[];
  email: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey: string;
}) {
  return stripe<CheckoutSession>(
    "POST",
    "checkout/sessions",
    {
      mode: "payment",
      customer_email: p.email,
      success_url: p.successUrl,
      cancel_url: p.cancelUrl,
      metadata: p.metadata,
      payment_intent_data: { metadata: p.metadata, description: p.description },
      line_items: (p.items ?? [{ amountCents: p.amountCents ?? 0, name: p.productName ?? "Lastshot", description: p.description }]).map(
        (it) => ({
          quantity: 1,
          price_data: {
            currency: "aud",
            unit_amount: it.amountCents,
            product_data: {
              name: it.name.slice(0, 120),
              tax_code: TAX_CODE,
              ...(it.description ? { description: it.description } : {}),
            },
          },
        }),
      ),
      invoice_creation: { enabled: "true" },
      // Short-lived, so an old tab can't be paid after the event has changed. Rounded to the
      // 10-minute idempotency window so a double click still gets the same session.
      expires_at: Math.floor(Date.now() / 600_000) * 600 + 3600,
    },
    p.idempotencyKey,
  );
}

export type BillingDocs = { invoiceUrl: string | null; invoicePdf: string | null; receiptUrl: string | null; invoiceNumber: string | null };

/** Invoice and receipt links for a paid Checkout session. */
export async function getBillingDocs(sessionId: string): Promise<BillingDocs> {
  const s = await stripe<{
    invoice: { hosted_invoice_url?: string | null; invoice_pdf?: string | null; number?: string | null } | string | null;
    payment_intent: { latest_charge?: { receipt_url?: string | null } | string | null } | string | null;
  }>("GET", `checkout/sessions/${encodeURIComponent(sessionId)}`, { expand: ["invoice", "payment_intent.latest_charge"] });
  const inv = s.invoice && typeof s.invoice === "object" ? s.invoice : null;
  const pi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
  const charge = pi?.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  return {
    invoiceUrl: inv?.hosted_invoice_url ?? null,
    invoicePdf: inv?.invoice_pdf ?? null,
    receiptUrl: charge?.receipt_url ?? null,
    invoiceNumber: inv?.number ?? null,
  };
}

export function getCheckoutSession(id: string) {
  return stripe<CheckoutSession>("GET", `checkout/sessions/${encodeURIComponent(id)}`);
}

/**
 * Checks a webhook's Stripe-Signature header (HMAC-SHA256 of "t.payload")
 * and rejects anything older than 5 minutes.
 */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i), kv.slice(i + 1)];
    }),
  );
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  const sigs = header
    .split(",")
    .filter((kv) => kv.startsWith("v1="))
    .map((kv) => Buffer.from(kv.slice(3), "hex"));
  return sigs.some((s) => s.length === expected.length && timingSafeEqual(s, expected));
}

/** Closes an unpaid Checkout session so it can't be paid any more. Ignores ones already closed. */
export async function expireCheckoutSession(id: string) {
  try {
    await stripe<CheckoutSession>("POST", `checkout/sessions/${encodeURIComponent(id)}/expire`, {});
    return true;
  } catch {
    return false;
  }
}
