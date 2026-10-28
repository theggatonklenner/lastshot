import Link from "next/link";
import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { stripeConfigured, stripeTestMode } from "@/lib/server/stripe";
import { confirmSession } from "@/lib/server/payments";
import { PLANS, eventGuestLimit, formatPrice, planInfo, planRank, upgradePrice } from "@/lib/plans";
import { formatDateTime } from "@/lib/format";
import { Notice, Panel, cx } from "@/components/ui";
import { PlanButton } from "./plan-button";
import { SeatsSlider } from "./seats-slider";

export const metadata: Metadata = { title: "Plan" };

export default async function UpgradePage({ params, searchParams }: PageProps<"/dashboard/events/[id]/upgrade">) {
  const { id } = await params;
  const sp = await searchParams;
  let { supabase, event } = await requireOwnedEvent(id);

  // Coming back from Stripe: confirm the payment with Stripe directly, in case
  // the webhook hasn't arrived yet.
  let confirmError = false;
  if (sp.paid && typeof sp.session_id === "string") {
    try {
      const res = await confirmSession(sp.session_id, event.id);
      confirmError = !res.ok;
      if (res.ok) ({ supabase, event } = await requireOwnedEvent(id));
    } catch (e) {
      console.error("confirm session failed", e);
      confirmError = true;
    }
  }

  const [{ data: stats }, { data: payments }] = await Promise.all([
    supabase.rpc("event_stats", { p_event_ids: [id] }),
    supabase
      .from("payments")
      .select("id, kind, plan, extra_guests, amount_cents, status, paid_at, created_at")
      .eq("event_id", id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false }),
  ]);
  const guests = stats?.[0]?.guests ?? 0;
  const current = planInfo(event.plan);
  const limit = eventGuestLimit(event);
  const ready = stripeConfigured();

  return (
    <div className="flex flex-col gap-6">
      {sp.paid && !confirmError && (
        <Notice tone="success">
          {sp.paid === "seats"
            ? `Payment received. Up to ${limit} guests can now join. A receipt is on its way to your email.`
            : `Payment received. This event is now on the ${current.name} plan. A receipt is on its way to your email.`}
        </Notice>
      )}
      {sp.paid && confirmError && (
        <Notice tone="info">
          We&apos;re confirming your payment with the bank. Refresh this page in a minute. If the plan hasn&apos;t
          changed after a few minutes, email support@lastshot.app.
        </Notice>
      )}
      {sp.cancelled && <Notice tone="info">Payment cancelled. Nothing was charged.</Notice>}
      {!ready && <Notice tone="warn">Payments aren&apos;t switched on yet, so upgrades are unavailable for now.</Notice>}
      {ready && stripeTestMode() && (
        <Notice tone="warn">Test mode: pay with card 4242 4242 4242 4242, any future date and any CVC.</Notice>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Plan for this event</h2>
        <p className="text-graphite">
          {limit === null
            ? `${guests} ${guests === 1 ? "guest has" : "guests have"} joined. There's no limit on this plan.`
            : `${guests} of ${limit} cameras taken${event.extra_guests ? ` (${current.guests} on the plan plus ${event.extra_guests} extra seats)` : ""}. When it's full, new guests see "This event is full" and you get an email.`}{" "}
          Pay once per event. Upgrading takes effect straight away, even mid-event, and you only pay the difference.
          {event.plan === "free" && " It also removes the watermark from every photo, including ones already taken."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PLANS.map((p) => {
          const isCurrent = p.id === event.plan;
          const lower = planRank(p.id) < planRank(event.plan);
          const price = upgradePrice(event.plan, p.id);
          return (
            <Panel
              key={p.id}
              className={cx("flex flex-col gap-4", isCurrent && "ring-2 ring-cobalt", lower && "opacity-60")}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-bold">{p.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-cobalt px-2.5 py-0.5 text-xs font-bold text-white">Current</span>
                )}
              </div>
              <div>
                <p className="display text-4xl numeric">{formatPrice(p.price)}</p>
                <p className="text-sm text-graphite">{p.price ? "AUD, once per event" : "No card needed"}</p>
              </div>
              <ul className="flex flex-col gap-1.5 text-[15px]">
                <li className="font-semibold">{p.guests === null ? "Unlimited guests" : `Up to ${p.guests} guests`}</li>
                <li className="text-graphite">{p.blurb}</li>
                <li className="text-graphite">
                  {p.id === "free" ? "Photos carry a small Lastshot watermark" : "No watermark, every feature included"}
                </li>
              </ul>
              <div className="mt-auto">
                {!isCurrent && !lower && p.id !== "free" && (
                  <PlanButton
                    eventId={event.id}
                    plan={p.id}
                    label={event.plan === "free" ? `Choose ${p.name}` : `Upgrade for ${formatPrice(price)}`}
                    disabled={!ready || !!event.suspended_at}
                  />
                )}
              </div>
            </Panel>
          );
        })}
      </div>

      {limit !== null && (
        <Panel>
          <div className="mb-5 flex flex-col gap-1">
            <h2 className="text-lg font-bold">Or add extra seats</h2>
            <p className="text-graphite">
              Need just a few more guests? Slide to add seats. The more you add, the less each one costs.
            </p>
          </div>
          <SeatsSlider
            eventId={event.id}
            plan={event.plan}
            extraGuests={event.extra_guests}
            currentLimit={limit}
            disabled={!ready || !!event.suspended_at}
          />
        </Panel>
      )}

      {!!payments?.length && (
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Payments</h2>
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 py-2.5 text-[15px]">
                <span>
                  {p.kind === "seats" ? `${p.extra_guests} extra seats` : `${planInfo(p.plan ?? "free").name} plan`}
                  <span className="block text-sm text-graphite">{formatDateTime(p.paid_at ?? p.created_at)}</span>
                </span>
                <span className="font-semibold numeric">{formatPrice(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-graphite">
            Invoices and receipts for all your events are on the{" "}
            <Link href="/dashboard/billing" className="font-semibold text-cobalt hover:underline">
              Billing page
            </Link>
            .
          </p>
        </Panel>
      )}
    </div>
  );
}
