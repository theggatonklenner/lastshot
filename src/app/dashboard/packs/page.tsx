import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganiser } from "@/lib/server/organiser";
import { stripeConfigured, stripeTestMode } from "@/lib/server/stripe";
import { confirmPackSession } from "@/lib/server/payments";
import { resolveDiscount, savedCode } from "@/lib/server/discounts";
import { signOne } from "@/lib/server/media";
import { planInfo } from "@/lib/plans";
import { formatDateTime } from "@/lib/format";
import { Notice, Panel } from "@/components/ui";
import { LogoEditor } from "@/app/dashboard/events/[id]/settings/addon-settings";
import { PackBuilder } from "./pack-builder";

export const metadata: Metadata = { title: "Event packs" };

export default async function PacksPage({ searchParams }: PageProps<"/dashboard/packs">) {
  const sp = await searchParams;
  const { supabase, user } = await requireOrganiser("/dashboard/packs");

  let confirmError = false;
  if (sp.paid && typeof sp.session_id === "string") {
    try {
      confirmError = !(await confirmPackSession(sp.session_id, user.id)).ok;
    } catch {
      confirmError = true;
    }
  }

  const [{ data: credits }, { data: profile }, withCode, standing] = await Promise.all([
    supabase.from("event_credits").select("id, pack, plan, branding, total, remaining, created_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("brand_logo_path").eq("id", user.id).maybeSingle(),
    savedCode().then((c) => (c ? resolveDiscount(user.id, c, { eventId: null }) : null)),
    resolveDiscount(user.id, null, { eventId: null }),
  ]);
  const toApplied = (d: Awaited<ReturnType<typeof resolveDiscount>>["discount"] | undefined) =>
    d ? { code: d.code, percent: d.percent, label: d.label } : null;
  const standingDiscount = toApplied(standing.discount);
  const hasBranding = (credits ?? []).some((c) => c.branding && c.remaining > 0);
  const logoUrl = await signOne(profile?.brand_logo_path ?? null);
  const ready = stripeConfigured();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="display-md text-[clamp(28px,4vw,40px)]">Event packs</h1>
        <p className="max-w-2xl text-graphite">
          Run lots of events? Buy several up front and save. Each event in a pack can be used on any event, any time.
          Made for planners, venues, schools and clubs.
        </p>
      </div>

      {sp.paid && !confirmError && (
        <Notice tone="success">Payment received. Your pack is ready. Open any event&apos;s Plan page and choose &quot;Use on this event&quot;.</Notice>
      )}
      {sp.paid && confirmError && <Notice tone="info">We&apos;re confirming your payment. Refresh this page in a minute.</Notice>}
      {sp.cancelled && <Notice tone="info">Payment cancelled. Nothing was charged.</Notice>}
      {!ready && <Notice tone="warn">Payments aren&apos;t switched on yet, so packs are unavailable for now.</Notice>}
      {ready && stripeTestMode() && <Notice tone="warn">Test mode: pay with card 4242 4242 4242 4242.</Notice>}

      {!!credits?.length && (
        <Panel>
          <h2 className="mb-3 text-lg font-bold">Your packs</h2>
          <ul className="flex flex-col divide-y divide-line">
            {credits.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="block font-semibold">
                    {c.pack === "school" ? "School pack" : `${c.total}-event pack`}: {planInfo(c.plan).name}
                    {c.branding ? " with branding" : ""}
                  </span>
                  <span className="text-sm text-graphite">Bought {formatDateTime(c.created_at)}</span>
                </span>
                <span className="font-semibold numeric">
                  {c.remaining} of {c.total} left
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-graphite">
            To use one, open an event from{" "}
            <Link href="/dashboard" className="font-semibold text-cobalt hover:underline">
              your events
            </Link>{" "}
            and go to its Plan page.
          </p>
        </Panel>
      )}

      {hasBranding && (
        <Panel>
          <LogoEditor
            endpoint="/api/account/logo"
            initialUrl={logoUrl}
            title="Your logo for every event"
            body="Upload it once. Each event you use a branded pack event on gets this logo automatically. You can still change it per event."
          />
        </Panel>
      )}

      <PackBuilder ready={ready} initialDiscount={toApplied(withCode?.discount) ?? standingDiscount} standingDiscount={standingDiscount} />
    </div>
  );
}
