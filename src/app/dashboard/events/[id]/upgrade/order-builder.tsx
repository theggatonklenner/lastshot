"use client";

import { useState, useTransition } from "react";
import { Button, Notice, Panel, Toggle, cx } from "@/components/ui";
import { PlanPrice } from "@/components/plan-price";
import {
  ADDONS,
  PLANS,
  UPGRADE_DISCOUNT,
  addonPrice,
  eventGuestLimit,
  formatPrice,
  hasAddon,
  orderToParams,
  planRank,
  priceCart,
  upgradePrice,
  type OrderChoice,
} from "@/lib/plans";
import type { Addon, EventRecord, Plan } from "@/lib/database.types";
import { SeatsSlider } from "./seats-slider";
import { startCartCheckout } from "./actions";

type EventLike = Pick<
  EventRecord,
  "id" | "plan" | "extra_guests" | "addon_frame" | "addon_branding" | "addon_storage" | "addon_storage_1y" | "addon_sms"
>;

/**
 * Pick a plan, extra seats and add-ons, see the total, then pay once.
 * The server prices the order again before charging.
 */
export function OrderBuilder({
  event,
  ready,
  disabled,
  publishOnPay,
  initialOrder,
}: {
  event: EventLike;
  ready: boolean;
  disabled?: boolean;
  /** New-event setup: publish the draft once paid. */
  publishOnPay?: boolean;
  /** Choices to start from, e.g. after a cancelled checkout. */
  initialOrder?: OrderChoice | null;
}) {
  const [plan, setPlan] = useState<Plan>(
    initialOrder && planRank(initialOrder.plan) >= planRank(event.plan) ? initialOrder.plan : event.plan,
  );
  const [seatsOn, setSeatsOn] = useState(!!initialOrder?.seats);
  const [seats, setSeats] = useState(initialOrder?.seats || 20);
  const [addons, setAddons] = useState<Addon[]>(initialOrder?.addons.filter((a) => !hasAddon(event, a)) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cart = priceCart(event, { plan, seats: seatsOn ? seats : 0, addons });
  const limitAfter = (() => {
    const base = PLANS.find((p) => p.id === (cart.plan ?? event.plan))!.guests;
    return base === null ? null : base + event.extra_guests + cart.seats;
  })();
  const currentLimit = eventGuestLimit(event);
  const finalPlan = cart.plan ?? event.plan;

  const toggleAddon = (id: Addon) => {
    if (addons.includes(id)) return setAddons(addons.filter((a) => a !== id));
    const other = id === "storage" ? "storage1y" : id === "storage1y" ? "storage" : null;
    setAddons([...addons.filter((a) => a !== other), id]);
  };

  function pay() {
    setError(null);
    // Remember the order in the address, so pressing back from Stripe shows the same choices.
    try {
      const url = new URL(window.location.href);
      for (const k of ["o_plan", "o_seats", "o_addons", "cancelled", "paid", "session_id"]) url.searchParams.delete(k);
      orderToParams({ plan, seats: seatsOn ? seats : 0, addons }).forEach((v, k) => url.searchParams.set(k, v));
      window.history.replaceState(window.history.state, "", url);
    } catch {
      /* not essential */
    }
    start(async () => {
      const res = await startCartCheckout(
        event.id,
        { plan, seats: seatsOn ? seats : 0, addons },
        publishOnPay ? { publish: true, from: "new" } : {},
      );
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-8">
        {/* Plan */}
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-xl font-bold">1. Plan</h2>
            <p className="text-graphite">
              {event.plan === "free"
                ? "Pick how many guests can join."
                : `Moving up from a paid plan gets ${UPGRADE_DISCOUNT}% off the new plan.`}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Plan">
            {PLANS.map((p) => {
              const current = p.id === event.plan;
              const lower = planRank(p.id) < planRank(event.plan);
              const selected = plan === p.id;
              const price = upgradePrice(event.plan, p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={lower}
                  onClick={() => setPlan(p.id)}
                  className={cx(
                    "flex flex-col gap-3 rounded-panel border bg-card p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    selected ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-lg font-bold">{p.name}</span>
                    {current ? (
                      <span className="rounded-full bg-cobalt px-2.5 py-0.5 text-xs font-bold text-white">Current</span>
                    ) : (
                      <span
                        aria-hidden
                        className={cx(
                          "size-5 rounded-full border-2",
                          selected ? "border-cobalt bg-cobalt shadow-[inset_0_0_0_3px_white]" : "border-line",
                        )}
                      />
                    )}
                  </span>
                  {current || lower ? (
                    <PlanPrice plan={p.id} note={current ? "Already paid" : "Lower than your plan"} />
                  ) : (
                    <PlanPrice
                      plan={p.id}
                      priceOverride={price}
                      note={event.plan !== "free" && price < p.price ? `${UPGRADE_DISCOUNT}% upgrade discount, was ${formatPrice(p.price)}` : undefined}
                    />
                  )}
                  <span className="font-semibold">{p.guests === null ? "Unlimited guests" : `Up to ${p.guests} guests`}</span>
                  <span className="text-sm text-graphite">
                    {p.id === "free" ? "Small Lastshot watermark on photos." : "No watermark."} {p.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Seats */}
        {finalPlan !== "unlimited" && currentLimit !== null && (
          <section className="flex flex-col gap-3">
            <div>
              <h2 className="text-xl font-bold">2. Extra seats</h2>
              <p className="text-graphite">Need a few more guests than the plan allows? The more you add, the bigger the discount.</p>
            </div>
            <Panel>
              <Toggle checked={seatsOn} onChange={setSeatsOn} label="Add extra seats" />
              {seatsOn && (
                <div className="mt-3 border-t border-line pt-5">
                  <SeatsSlider
                    seats={seats}
                    setSeats={setSeats}
                    currentLimit={(limitAfter ?? 0) - seats}
                  />
                </div>
              )}
            </Panel>
          </section>
        )}

        {/* Add-ons */}
        <section className="flex flex-col gap-3" id="addons">
          <div>
            <h2 className="text-xl font-bold">{finalPlan !== "unlimited" && currentLimit !== null ? "3" : "2"}. Add-ons</h2>
            <p className="text-graphite">One-off extras for this event.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {ADDONS.filter((a) => !(a.id === "storage1y" && event.addon_storage)).map((a) => {
              const owned = hasAddon(event, a.id);
              const on = addons.includes(a.id);
              const price = addonPrice(a.id, { plan: finalPlan, addon_storage_1y: event.addon_storage_1y });
              return (
                <button
                  key={a.id}
                  type="button"
                  role="checkbox"
                  aria-checked={owned || on}
                  disabled={owned}
                  onClick={() => toggleAddon(a.id)}
                  className={cx(
                    "flex flex-col gap-2 rounded-panel border bg-card p-4 text-left transition-colors disabled:cursor-default",
                    owned ? "border-ok/50" : on ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
                  )}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-bold">{a.name}</span>
                    {owned ? (
                      <span className="shrink-0 rounded-full bg-ok px-2.5 py-0.5 text-xs font-bold text-white">Added</span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="display text-xl numeric">{formatPrice(price)}</span>
                        <span
                          aria-hidden
                          className={cx(
                            "flex size-5 items-center justify-center rounded-[6px] border-2 text-xs text-white",
                            on ? "border-cobalt bg-cobalt" : "border-line",
                          )}
                        >
                          {on ? "✓" : ""}
                        </span>
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-graphite">{a.blurb}</span>
                  {a.id === "storage" && event.addon_storage_1y && !owned && (
                    <span className="text-sm font-semibold text-ok">{UPGRADE_DISCOUNT}% off because you have 1 year</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Summary */}
      <aside className="lg:sticky lg:top-24">
        <Panel className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Your order</h2>
          {cart.lines.length === 0 ? (
            <p className="text-graphite">Choose a plan, seats or add-ons to see the price.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block font-semibold">{l.label}</span>
                    <span className="block text-sm text-graphite">{l.detail}</span>
                  </span>
                  <span className="shrink-0 font-semibold numeric">{formatPrice(l.cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">Total</span>
            <span className="display text-3xl numeric">{cart.total ? formatPrice(cart.total) : "$0"}</span>
          </div>
          {limitAfter !== currentLimit && (
            <p className="text-sm text-graphite">
              Guest limit after paying: <span className="font-semibold text-ink">{limitAfter === null ? "unlimited" : limitAfter}</span>
            </p>
          )}
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="button" onClick={pay} pending={pending} disabled={!cart.total || !ready || disabled}>
            {cart.total ? `Pay ${formatPrice(cart.total)}` : "Nothing to pay"}
          </Button>
          <p className="text-xs text-graphite">AUD, paid once through Stripe. Everything takes effect as soon as the payment goes through.</p>
        </Panel>
      </aside>
    </div>
  );
}
