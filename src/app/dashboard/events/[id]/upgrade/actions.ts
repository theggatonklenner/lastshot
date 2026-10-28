"use server";

import { redirect } from "next/navigation";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { createCheckoutSession, stripeConfigured } from "@/lib/server/stripe";
import { PLAN_ORDER, eventGuestLimit, planInfo, planRank, seatDiscount, seatPrice, upgradePrice, guestLimitText, validSeatCount } from "@/lib/plans";
import type { Plan } from "@/lib/database.types";

export type CheckoutState = { error?: string } | undefined;

/** Starts a Stripe Checkout for upgrading this event. Any organiser can pay. */
export async function startCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const id = String(form.get("eventId") ?? "");
  const plan = String(form.get("plan") ?? "") as Plan;
  const { event, user } = await requireOwnedEvent(id);

  if (!PLAN_ORDER.includes(plan) || plan === "free") return { error: "Choose a plan." };
  if (planRank(plan) <= planRank(event.plan)) return { error: "This event already has that plan or a bigger one." };
  if (!stripeConfigured()) return { error: "Payments aren't set up yet. Try again soon." };
  if (event.suspended_at) return { error: "This event is suspended, so it can't be upgraded." };

  const amount = upgradePrice(event.plan, plan);
  const info = planInfo(plan);
  const base = `${siteUrl()}/dashboard/events/${event.id}/upgrade`;
  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      amountCents: amount,
      productName: `Lastshot ${info.name}: ${event.title}`.slice(0, 120),
      description:
        event.plan === "free"
          ? `${guestLimitText(plan)} for one event.`
          : `Upgrade from ${planInfo(event.plan).name} to ${info.name}. ${guestLimitText(plan)}.`,
      email: user.email!,
      successUrl: `${base}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?cancelled=1`,
      metadata: { event_id: event.id, plan, from_plan: event.plan, user_id: user.id },
      idempotencyKey: `checkout:${event.id}:${event.plan}:${plan}:${user.id}:${Math.floor(Date.now() / 600_000)}`,
    });
    const { error } = await admin()
      .from("payments")
      .upsert(
        { event_id: event.id, user_id: user.id, plan: plan as Exclude<Plan, "free">, amount_cents: amount, stripe_session_id: session.id },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    url = session.url;
  } catch (e) {
    console.error("checkout failed", e);
    return { error: "Couldn't open the payment page. Try again in a minute." };
  }
  if (!url) return { error: "Couldn't open the payment page. Try again in a minute." };
  redirect(url);
}

/** Starts a Stripe Checkout for extra seats on top of the event's plan. */
export async function startSeatsCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const id = String(form.get("eventId") ?? "");
  const seats = Number(form.get("seats"));
  const { event, user } = await requireOwnedEvent(id);

  if (!validSeatCount(seats)) return { error: "Choose how many seats to add." };
  if (eventGuestLimit(event) === null) return { error: "This event has no guest limit, so it doesn't need extra seats." };
  if (!stripeConfigured()) return { error: "Payments aren't set up yet. Try again soon." };
  if (event.suspended_at) return { error: "This event is suspended, so it can't be changed." };

  const amount = seatPrice(seats);
  const base = `${siteUrl()}/dashboard/events/${event.id}/upgrade`;
  let url: string | null = null;
  try {
    const session = await createCheckoutSession({
      amountCents: amount,
      productName: `Lastshot: ${seats} extra seats for ${event.title}`.slice(0, 120),
      description: seatDiscount(seats)
        ? `${seats} more guests can join. Includes a ${seatDiscount(seats)}% bulk discount.`
        : `${seats} more guests can join.`,
      email: user.email!,
      successUrl: `${base}?paid=seats&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}?cancelled=1`,
      metadata: { event_id: event.id, kind: "seats", seats: String(seats), user_id: user.id },
      idempotencyKey: `seats:${event.id}:${seats}:${event.extra_guests}:${user.id}:${Math.floor(Date.now() / 600_000)}`,
    });
    const { error } = await admin()
      .from("payments")
      .upsert(
        { event_id: event.id, user_id: user.id, kind: "seats", plan: null, extra_guests: seats, amount_cents: amount, stripe_session_id: session.id },
        { onConflict: "stripe_session_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
    url = session.url;
  } catch (e) {
    console.error("seats checkout failed", e);
    return { error: "Couldn't open the payment page. Try again in a minute." };
  }
  if (!url) return { error: "Couldn't open the payment page. Try again in a minute." };
  redirect(url);
}
