"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { createCheckoutSession, stripeConfigured } from "@/lib/server/stripe";
import { orderToParams, priceCart } from "@/lib/plans";
import { recordError } from "@/lib/server/error-log";
import type { Addon, Plan } from "@/lib/database.types";

export type CheckoutState = { error?: string } | undefined;

const Cart = z.object({
  plan: z.enum(["free", "small", "party", "big", "unlimited"]),
  seats: z.number().int().min(0).max(500),
  addons: z.array(z.enum(["frame", "branding", "storage", "storage1y", "sms"])).max(5),
});

/**
 * One Stripe Checkout for everything in the order: a plan upgrade, extra seats
 * and add-ons. The price is worked out here from the event as it is now, never
 * taken from the browser. With `publish`, a draft event goes live once paid.
 */
export async function startCartCheckout(
  eventId: string,
  input: { plan: Plan; seats: number; addons: Addon[] },
  opts: { publish?: boolean; from?: "new" } = {},
): Promise<CheckoutState> {
  const parsed = Cart.safeParse(input);
  if (!parsed.success) return { error: "Check your order and try again." };
  const { event, user } = await requireOwnedEvent(eventId);
  if (event.suspended_at) return { error: "This event is suspended, so it can't be changed." };

  const cart = priceCart(event, parsed.data);
  if (cart.lines.length === 0 || cart.total === 0) return { error: "Choose something to add first." };
  if (!stripeConfigured()) return { error: "Payments aren't set up yet. Try again soon." };

  const base = `${siteUrl()}/dashboard/events/${event.id}/upgrade`;
  const from = opts.from === "new" ? "&from=new" : "";
  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      items: cart.lines.map((l) => ({ amountCents: l.cents, name: `${l.label}: ${event.title}`, description: l.detail })),
      description: `Lastshot: ${event.title}`,
      email: user.email!,
      successUrl: `${base}?paid=cart${from}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?cancelled=1${from}&${orderToParams({ plan: parsed.data.plan, seats: parsed.data.seats, addons: parsed.data.addons })}`,
      metadata: {
        event_id: event.id,
        kind: "bundle",
        plan: cart.plan ?? "",
        seats: String(cart.seats),
        addons: cart.addons.join(","),
        publish: opts.publish ? "1" : "0",
        user_id: user.id,
      },
      idempotencyKey: [
        "cart",
        event.id,
        event.plan,
        event.extra_guests,
        cart.plan ?? "-",
        cart.seats,
        [...cart.addons].sort().join("+"),
        opts.publish ? "pub" : "",
        user.id,
        Math.floor(Date.now() / 600_000),
      ].join(":"),
    });
    const { error } = await admin()
      .from("payments")
      .upsert(
        {
          event_id: event.id,
          user_id: user.id,
          kind: "bundle",
          plan: cart.plan as Exclude<Plan, "free"> | null,
          addons: cart.addons,
          extra_guests: cart.seats,
          amount_cents: cart.total,
          stripe_session_id: session.id,
          publish_on_paid: !!opts.publish,
        },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    url = session.url;
  } catch (e) {
    console.error("checkout failed", e);
    await recordError({
      source: "server",
      message: `Checkout failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500),
      path: `/dashboard/events/${event.id}/upgrade`,
      detail: JSON.stringify({ plan: cart.plan, seats: cart.seats, addons: cart.addons, total: cart.total }),
    }).catch(() => {});
    return { error: "Couldn't open the payment page. Try again in a minute." };
  }
  if (!url) return { error: "Couldn't open the payment page. Try again in a minute." };
  redirect(url);
}
