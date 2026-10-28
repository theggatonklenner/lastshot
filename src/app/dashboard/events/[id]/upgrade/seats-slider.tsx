"use client";

import { cx } from "@/components/ui";
import {
  SEATS_MAX,
  SEATS_MIN,
  SEATS_STEP,
  SEAT_TIERS,
  formatPrice,
  seatDiscount,
  seatPrice,
  seatRate,
} from "@/lib/plans";
/** Extra seats slider with bulk discounts. Controlled: the order builder owns the value. */
export function SeatsSlider({
  seats,
  setSeats,
  currentLimit,
}: {
  seats: number;
  setSeats: (n: number) => void;
  currentLimit: number;
}) {
  const rate = seatRate(seats);
  const total = seatPrice(seats);
  const fullPrice = seats * SEAT_TIERS[SEAT_TIERS.length - 1].cents;
  const saving = fullPrice - total;
  const pct = ((seats - SEATS_MIN) / (SEATS_MAX - SEATS_MIN)) * 100;
  const tiers = [...SEAT_TIERS].reverse();
  const discount = seatDiscount(seats);
  const nextTier = tiers.find((t) => t.from > seats);
  const nextDiscount = nextTier ? seatDiscount(nextTier.from) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="display text-5xl numeric">+{seats}</p>
          <p className="text-graphite">
            guests, taking the limit from {currentLimit} to {currentLimit + seats}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="flex items-baseline gap-2 sm:justify-end">
            {saving > 0 && <span className="text-lg text-graphite line-through numeric">{formatPrice(fullPrice)}</span>}
            <span className="display text-4xl numeric">{formatPrice(total)}</span>
          </p>
          {discount > 0 ? (
            <p className="mt-1 inline-flex rounded-full bg-ok-soft px-2.5 py-0.5 text-sm font-semibold text-ok">
              {discount}% off · You save {formatPrice(saving)}
            </p>
          ) : (
            <p className="text-sm text-graphite">Standard price</p>
          )}
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

      {nextTier && (
        <p className="text-[15px] text-graphite">
          Add <span className="font-semibold text-ink numeric">{nextTier.from - seats}</span> more to get{" "}
          <span className="font-semibold text-ok">{nextDiscount}% off</span> every seat.
        </p>
      )}

      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Bulk discounts">
        {tiers.map((t, i) => {
          const to = tiers[i + 1] ? tiers[i + 1].from - SEATS_STEP : SEATS_MAX;
          const active = rate === t.cents;
          const off = seatDiscount(t.from);
          return (
            <li
              key={t.from}
              className={cx(
                "rounded-control border px-3 py-2.5 transition-colors",
                active ? "border-ok bg-ok-soft text-ok" : "border-line text-graphite",
              )}
            >
              <span className="block font-bold">{off ? `${off}% off` : "Standard price"}</span>
              <span className="text-sm numeric">
                {i === tiers.length - 1 ? `${t.from}+ seats` : `${Math.max(t.from, SEATS_MIN)}–${to} seats`}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-graphite">Seats stay with the event, even if you upgrade later.</p>
    </div>
  );
}
