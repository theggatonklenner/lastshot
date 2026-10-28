import { formatPrice, planInfo, planSaving, planValue } from "@/lib/plans";
import type { Plan } from "@/lib/database.types";

/** Plan price with what the guests would cost at $2 a seat, crossed out, and the saving. */
export function PlanPrice({ plan, priceOverride, note }: { plan: Plan; priceOverride?: number; note?: string }) {
  const info = planInfo(plan);
  const value = planValue(plan);
  const saving = planSaving(plan);
  const price = priceOverride ?? info.price;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline gap-x-2 whitespace-nowrap">
        {value !== null && value > price && (
          <span className="text-lg text-graphite line-through numeric">{formatPrice(value)}</span>
        )}
        <span className="display text-5xl numeric xl:text-[42px]">{price ? formatPrice(price) : "$0"}</span>
      </p>
      <p className="text-sm text-graphite">{note ?? (info.price ? "AUD, once per event" : "No card needed")}</p>
      {saving ? (
        <p className="self-start rounded-full bg-ok-soft px-2.5 py-0.5 text-sm font-semibold text-ok">
          Save {formatPrice(saving.cents)} ({saving.percent}% off)
        </p>
      ) : plan === "unlimited" ? (
        <p className="self-start rounded-full bg-ok-soft px-2.5 py-0.5 text-sm font-semibold text-ok">Best value for big crowds</p>
      ) : plan === "free" ? (
        <p className="self-start rounded-full bg-paper-2 px-2.5 py-0.5 text-sm font-semibold text-graphite">
          {formatPrice(value ?? 0)} of seats, free
        </p>
      ) : null}
    </div>
  );
}
