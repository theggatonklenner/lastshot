"use client";

import { useActionState, useState } from "react";
import { Button, cx } from "@/components/ui";
import {
  SEATS_MAX,
  SEATS_MIN,
  SEATS_STEP,
  SEAT_TIERS,
  betterPlanThanSeats,
  formatPrice,
  seatPrice,
  seatRate,
} from "@/lib/plans";
import type { Plan } from "@/lib/database.types";
import { startSeatsCheckout, type CheckoutState } from "./actions";

export function SeatsSlider({
  eventId,
  plan,
  extraGuests,
  currentLimit,
  disabled,
}: {
  eventId: string;
  plan: Plan;
  extraGuests: number;
  currentLimit: number;
  disabled?: boolean;
}) {
  const [seats, setSeats] = useState(20);
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startSeatsCheckout, undefined);
  const rate = seatRate(seats);
  const total = seatPrice(seats);
  const fullPrice = seats * SEAT_TIERS[SEAT_TIERS.length - 1].cents;
  const saving = fullPrice - total;
  const better = betterPlanThanSeats(plan, extraGuests, seats);
  const pct = ((seats - SEATS_MIN) / (SEATS_MAX - SEATS_MIN)) * 100;
  const tiers = [...SEAT_TIERS].reverse();

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="seats" value={seats} />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="display text-5xl numeric">+{seats}</p>
          <p className="text-graphite">
            guests, taking the limit from {currentLimit} to {currentLimit + seats}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="display text-4xl numeric">{formatPrice(total)}</p>
          <p className="text-sm text-graphite">
            {formatPrice(rate)} a seat{saving > 0 && <span className="font-semibold text-ok"> · You save {formatPrice(saving)}</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="seats-range" className="sr-only">
          Extra seats
        </label>
        <input
          id="seats-range"
          type="range"
          min={SEATS_MIN}
          max={SEATS_MAX}
          step={SEATS_STEP}
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="seats-range w-full"
          style={{ ["--pct" as string]: `${pct}%` }}
          aria-valuetext={`${seats} seats, ${formatPrice(total)}`}
        />
        <div className="flex justify-between text-xs text-graphite numeric">
          <span>{SEATS_MIN}</span>
          <span>{SEATS_MAX}</span>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Price per seat">
        {tiers.map((t, i) => {
          const to = tiers[i + 1] ? tiers[i + 1].from - SEATS_STEP : SEATS_MAX;
          const active = rate === t.cents;
          return (
            <li
              key={t.from}
              className={cx(
                "rounded-control border px-3 py-2.5 transition-colors",
                active ? "border-cobalt bg-cobalt-soft text-cobalt-deep" : "border-line text-graphite",
              )}
            >
              <span className="block font-bold numeric">{formatPrice(t.cents)} a seat</span>
              <span className="text-sm numeric">
                {Math.max(t.from, SEATS_MIN)}–{to} seats
              </span>
            </li>
          );
        })}
      </ul>

      {better && (
        <p className="rounded-control bg-flash/30 px-4 py-3 text-[15px]">
          Tip: the <span className="font-semibold">{better.name}</span> plan covers{" "}
          {better.guests === null ? "unlimited" : better.guests} guests and costs less than these seats. Choose it above
          instead.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="submit" disabled={disabled || pending}>
          {pending ? "Opening checkout…" : `Add ${seats} seats for ${formatPrice(total)}`}
        </Button>
        <span className="text-sm text-graphite">Seats stay with the event, even if you upgrade later.</span>
      </div>
      {state?.error && <p className="text-sm text-signal">{state.error}</p>}
    </form>
  );
}
