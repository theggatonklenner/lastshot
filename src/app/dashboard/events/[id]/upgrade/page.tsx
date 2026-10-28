import Link from "next/link";
import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { stripeConfigured, stripeTestMode } from "@/lib/server/stripe";
import { confirmSession } from "@/lib/server/payments";
import { ADDONS, eventGuestLimit, formatPrice, hasAddon, paymentLabel, planInfo , addonInfo, orderFromParams } from "@/lib/plans";
import { retentionUntil } from "@/lib/rules";
import type { Addon } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { Notice, Panel } from "@/components/ui";
import { OrderBuilder } from "./order-builder";
import { CreditPicker } from "./credit-picker";
import { resolveDiscount, savedCode } from "@/lib/server/discounts";
import { planRank } from "@/lib/plans";

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
      .select("id, kind, plan, addon, addons, extra_guests, amount_cents, status, paid_at, created_at")
      .eq("event_id", id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false }),
  ]);
  const guests = stats?.[0]?.guests ?? 0;
  const current = planInfo(event.plan);
  const limit = eventGuestLimit(event);
  const ownedAddons = ADDONS.filter((a) => hasAddon(event, a.id) && !(a.id === "storage1y" && event.addon_storage));
  const keepUntil = retentionUntil(event);
  const ready = stripeConfigured();

  // Discount to start with: a code saved from a referral or venue link, or the venue's standing discount.
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user!.id;
  const [withCode, standing] = await Promise.all([
    savedCode().then((c) => (c ? resolveDiscount(userId, c, { eventId: event.id }) : null)),
    resolveDiscount(userId, null, { eventId: event.id }),
  ]);
  const toApplied = (d: Awaited<ReturnType<typeof resolveDiscount>>["discount"] | undefined) =>
    d ? { code: d.code, percent: d.percent, label: d.label } : null;
  const standingDiscount = toApplied(standing.discount);
  const initialDiscount = toApplied(withCode?.discount) ?? standingDiscount;

  // Pack credits that would add something to this event.
  const { data: credits } = await supabase
    .from("event_credits")
    .select("id, pack, plan, branding, remaining")
    .eq("owner_id", userId)
    .gt("remaining", 0)
    .order("created_at");
  const usable = (credits ?? []).filter(
    (c) => planRank(c.plan) > planRank(event.plan) || (c.branding && !event.addon_branding),
  );

  return (
    <div className="flex flex-col gap-6">
      {sp.paid && !confirmError && (
        <Notice tone="success">
          {sp.paid === "seats"
            ? `Payment received. Up to ${limit} guests can now join. A receipt is on its way to your email.`
            : sp.paid === "bundle" || sp.paid === "cart"
            ? "Payment received. Everything in your order is now on. A receipt is on its way to your email."
            : sp.paid === "addon" && typeof sp.addon === "string" && ADDONS.some((a) => a.id === sp.addon)
            ? `Payment received. ${addonInfo(sp.addon as Addon).name} is now on for this event. A receipt is on its way to your email.`
            : `Payment received. This event is now on the ${current.name} plan. A receipt is on its way to your email.`}
        </Notice>
      )}
      {sp.paid && confirmError && (
        <Notice tone="info">
          We&apos;re confirming your payment with the bank. Refresh this page in a minute. If the plan hasn&apos;t
          changed after a few minutes, email support@lastshot.app.
        </Notice>
      )}
      {sp.from === "new" && event.status !== "draft" && (
        <Notice
          tone="success"
          action={
            <Link href={`/dashboard/events/${event.id}/share?published=1`} className="font-semibold underline">
              Get the QR code
            </Link>
          }
        >
          Your event is published. Next, print the sign or share the link.
        </Notice>
      )}

      {sp.cancelled && sp.from === "new" && event.status === "draft" && (
        <Notice
          tone="info"
          action={
            <Link href={`/dashboard/events/${event.id}`} className="font-semibold underline">
              Publish on Free instead
            </Link>
          }
        >
          Payment cancelled, nothing was charged. Your event is saved as a draft. Pay below to publish it.
        </Notice>
      )}
      {sp.cancelled && !(sp.from === "new" && event.status === "draft") && (
        <Notice tone="info">Payment cancelled. Nothing was charged.</Notice>
      )}
      {!ready && <Notice tone="warn">Payments aren&apos;t switched on yet, so upgrades are unavailable for now.</Notice>}
      {ready && stripeTestMode() && (
        <Notice tone="warn">Test mode: pay with card 4242 4242 4242 4242, any future date and any CVC.</Notice>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold">Plan and extras for this event</h2>
        <p className="text-graphite">
          {limit === null
            ? `${guests} ${guests === 1 ? "guest has" : "guests have"} joined. There's no limit on this plan.`
            : `${guests} of ${limit} cameras taken${event.extra_guests ? ` (${current.guests} on the plan plus ${event.extra_guests} extra seats)` : ""}. When it's full, new guests see "This event is full" and you get an email.`}{" "}
          Choose what you need, check the total, then pay once. Everything takes effect straight away, even mid-event.
          {event.plan === "free" && " Any paid plan also removes the watermark from every photo, including ones already taken."}
        </p>
      </div>

      {usable.length > 0 && !event.suspended_at && <CreditPicker eventId={event.id} credits={usable} />}

      <OrderBuilder
        initialDiscount={initialDiscount}
        standingDiscount={standingDiscount}
        event={event}
        ready={ready}
        disabled={!!event.suspended_at}
        publishOnPay={sp.from === "new" && event.status === "draft"}
        initialOrder={sp.paid ? null : orderFromParams(sp)}
      />

      {ownedAddons.length > 0 && (
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Your add-ons</h2>
          <ul className="flex flex-col divide-y divide-line">
            {ownedAddons.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="font-semibold">{a.name}</span>
                {a.id === "setup" ? (
                  <span className="text-sm text-graphite">We&apos;ll email you to book a time</span>
                ) : a.id === "export" ? (
                  <Link href={`/dashboard/events/${event.id}/guests`} className="text-sm font-semibold text-cobalt hover:underline">
                    Download guest data
                  </Link>
                ) : a.id === "link" ? (
                  <Link href={`/dashboard/events/${event.id}/share#custom-link`} className="text-sm font-semibold text-cobalt hover:underline">
                    {event.custom_slug ? `lastshot.app/${event.custom_slug}` : "Choose your link"}
                  </Link>
                ) : a.id === "frame" || a.id === "branding" ? (
                  <Link href={`/dashboard/events/${event.id}/settings#addons`} className="text-sm font-semibold text-cobalt hover:underline">
                    {a.id === "frame" ? "Set up the frame" : "Upload your logo"}
                  </Link>
                ) : a.id === "storage" || a.id === "storage1y" ? (
                  <span className="text-sm text-graphite">
                    {keepUntil ? `Photos kept until ${formatDateTime(keepUntil.toISOString())}` : "Kept longer after the event"}
                  </span>
                ) : (
                  <span className="text-sm text-graphite">Guests can leave a mobile number</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {!!payments?.length && (
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Payments</h2>
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 py-2.5 text-[15px]">
                <span>
                  {paymentLabel(p)}
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
