"use client";

import { useState, useTransition } from "react";
import { Button, Notice, Panel, Toggle, cx } from "@/components/ui";
import { DiscountField, type AppliedDiscount } from "@/components/discount-field";
import { BRANDING_PRICE, PACKS, PLANS, SCHOOL_PACK, applyDiscount, formatPrice, packPrice, packValue, planInfo, type PackId } from "@/lib/plans";
import type { Plan } from "@/lib/database.types";
import { startPackCheckout } from "./actions";

type PaidPlan = Exclude<Plan, "free">;

export function PackBuilder({
  ready,
  initialDiscount,
  standingDiscount,
}: {
  ready: boolean;
  initialDiscount: AppliedDiscount | null;
  standingDiscount: AppliedDiscount | null;
}) {
  const [pack, setPack] = useState<PackId>("5");
  const [plan, setPlan] = useState<PaidPlan>("party");
  const [branding, setBranding] = useState(false);
  const [discount, setDiscount] = useState<AppliedDiscount | null>(initialDiscount);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const school = pack === "school";
  const p = school ? SCHOOL_PACK.plan : plan;
  const b = school ? true : branding;
  const price = packPrice(pack, p, b);
  const value = packValue(pack, p, b);
  const events = school ? SCHOOL_PACK.events : PACKS.find((x) => x.id === pack)!.events;
  const priced = applyDiscount([{ key: "pack", label: "", detail: "", cents: price }], discount?.percent ?? 0, null);

  function buy() {
    setError(null);
    start(async () => {
      const res = await startPackCheckout({ pack, plan: p, branding: b, code: discount?.code ?? undefined });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">1. Pick a pack</h2>
          <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Pack">
            {[...PACKS.map((x) => ({ id: x.id as PackId, title: `${x.events} events`, sub: `${x.percent}% off` })), { id: "school" as PackId, title: "School pack", sub: "6 Big events with your logo" }].map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={pack === x.id}
                onClick={() => setPack(x.id)}
                className={cx(
                  "flex flex-col gap-1 rounded-panel border bg-card p-4 text-left",
                  pack === x.id ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
                )}
              >
                <span className="text-lg font-bold">{x.title}</span>
                <span className="font-semibold text-ok">{x.sub}</span>
              </button>
            ))}
          </div>
          {school && <p className="text-graphite">{SCHOOL_PACK.blurb}</p>}
        </section>

        {!school && (
          <>
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">2. Plan for each event</h2>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Plan">
                {PLANS.filter((x) => x.id !== "free").map((x) => (
                  <button
                    key={x.id}
                    type="button"
                    role="radio"
                    aria-checked={plan === x.id}
                    onClick={() => setPlan(x.id as PaidPlan)}
                    className={cx(
                      "flex items-center justify-between gap-3 rounded-panel border bg-card p-4 text-left",
                      plan === x.id ? "border-cobalt ring-2 ring-cobalt/25" : "border-line hover:border-ink/30",
                    )}
                  >
                    <span>
                      <span className="block font-bold">{x.name}</span>
                      <span className="text-sm text-graphite">{x.guests === null ? "Unlimited guests" : `Up to ${x.guests} guests`}</span>
                    </span>
                    <span className="numeric text-graphite">{formatPrice(x.price)} each</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">3. Your logo on every event</h2>
              <Panel>
                <Toggle
                  checked={branding}
                  onChange={setBranding}
                  label={`Add your branding to every event (+${formatPrice(BRANDING_PRICE)} each, before the discount)`}
                />
                <p className="mt-2 text-sm text-graphite">Upload your logo once and it goes on each event&apos;s guest pages, signs and slideshow.</p>
              </Panel>
            </section>
          </>
        )}
      </div>

      <aside className="lg:sticky lg:top-24">
        <Panel className="flex flex-col gap-4">
          <h2 className="text-lg font-bold">Your pack</h2>
          <p>
            <span className="font-semibold">
              {events} {planInfo(p).name} events
            </span>
            {b ? " with your branding" : ""}
          </p>
          <p className="text-sm text-graphite">
            Bought one at a time: <span className="line-through">{formatPrice(value)}</span>. You save{" "}
            <span className="font-semibold text-ok">{formatPrice(value - price)}</span>.
          </p>
          <DiscountField eventId={null} applied={discount} setApplied={setDiscount} standing={standingDiscount} />
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">Total</span>
            <span className="flex items-baseline gap-2">
              {priced.discount > 0 && <span className="text-graphite line-through numeric">{formatPrice(price)}</span>}
              <span className="display text-3xl numeric">{formatPrice(priced.total)}</span>
            </span>
          </div>
          <p className="text-sm text-graphite numeric">{formatPrice(Math.round(priced.total / events))} per event</p>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="button" onClick={buy} pending={pending} disabled={!ready}>
            Pay {formatPrice(priced.total)}
          </Button>
          <p className="text-xs text-graphite">AUD, paid once. Pack events don&apos;t expire.</p>
        </Panel>
      </aside>
    </div>
  );
}
