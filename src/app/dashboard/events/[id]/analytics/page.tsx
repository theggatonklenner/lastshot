import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { shotLimit } from "@/lib/rules";
import { formatTime, pluralise } from "@/lib/format";
import { EmptyState, Panel } from "@/components/ui";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params }: PageProps<"/dashboard/events/[id]/analytics">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnedEvent(id);

  const [{ data: timeline }, { data: stats }, { data: guests }, { data: photos }] = await Promise.all([
    supabase.rpc("event_upload_timeline", { p_event_id: id, p_bucket_minutes: 30 }),
    supabase.rpc("event_stats", { p_event_ids: [id] }),
    supabase.from("event_guests").select("id, display_name, photos_submitted, created_at").eq("event_id", id),
    supabase.from("photos").select("guest_id, source").eq("event_id", id).eq("upload_status", "complete"),
  ]);

  const s = stats?.[0];
  if (!s || s.photos === 0) {
    return (
      <EmptyState title="Nothing to measure yet">
        Analytics fill in once guests start taking photos.
      </EmptyState>
    );
  }

  const g = guests ?? [];
  const shooters = g.filter((x) => x.photos_submitted > 0).length;
  const finished = g.filter((x) => x.photos_submitted >= shotLimit(event)).length;
  const fromLibrary = (photos ?? []).filter((p) => p.source === "library").length;
  const perGuest = new Map<string, number>();
  for (const p of photos ?? []) perGuest.set(p.guest_id, (perGuest.get(p.guest_id) ?? 0) + 1);
  const top = [...perGuest.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([gid, n]) => {
      const idx = g.findIndex((x) => x.id === gid);
      return { name: g[idx]?.display_name || `Guest ${idx + 1}`, n };
    });

  const bars = timeline ?? [];
  const max = Math.max(1, ...bars.map((b) => b.photos));
  const peak = bars.reduce((a, b) => (b.photos > a.photos ? b : a), bars[0]);
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
        <Metric label="Guests who took a photo" value={`${shooters} of ${g.length}`} />
        <Metric label="Finished their roll" value={pct(finished, g.length)} />
        <Metric label="Average per guest" value={shooters ? (s.photos / shooters).toFixed(1) : "0"} />
        <Metric label="From camera roll" value={pct(fromLibrary, s.photos)} />
      </dl>

      <Panel>
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Photos over time</h2>
          {peak && (
            <p className="text-[15px] text-graphite">
              Busiest half hour: {formatTime(peak.bucket, event.timezone)}, {pluralise(peak.photos, "photo")}
            </p>
          )}
        </div>
        <p className="mb-5 text-sm text-graphite">Each bar is 30 minutes.</p>
        <div className="flex h-48 items-end gap-1 overflow-x-auto border-b border-line pb-px" role="img" aria-label="Photos uploaded per 30 minutes">
          {bars.map((b) => (
            <div key={b.bucket} className="group relative flex min-w-3 flex-1 flex-col justify-end self-stretch">
              <div
                className="rounded-t-[3px] bg-cobalt transition-colors group-hover:bg-cobalt-deep"
                style={{ height: `${(b.photos / max) * 100}%` }}
              />
              <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-paper group-hover:block">
                {formatTime(b.bucket, event.timezone)}: {b.photos}
              </span>
            </div>
          ))}
        </div>
        {bars.length > 1 && (
          <div className="mt-2 flex justify-between text-sm text-graphite">
            <span>{formatTime(bars[0].bucket, event.timezone)}</span>
            <span>{formatTime(bars[bars.length - 1].bucket, event.timezone)}</span>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Most active cameras</h2>
          <ol className="flex flex-col gap-3">
            {top.map((t) => (
              <li key={t.name + t.n} className="flex items-center gap-3">
                <span className="w-28 truncate font-semibold">{t.name}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-2">
                  <span className="block h-full rounded-full bg-cobalt" style={{ width: `${(t.n / shotLimit(event)) * 100}%` }} />
                </span>
                <span className="w-10 text-right numeric">{t.n}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Review</h2>
          <dl className="flex flex-col gap-2 text-[15px]">
            <Row k="Approved" v={s.photos - s.pending_review - s.rejected} />
            <Row k="Waiting for review" v={s.pending_review} />
            <Row k="Rejected" v={s.rejected} />
            <Row k="Flagged" v={s.flagged} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="display text-3xl numeric">{value}</dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <div className="flex justify-between border-b border-line pb-2 last:border-0">
      <dt className="text-graphite">{k}</dt>
      <dd className="font-semibold numeric">{v}</dd>
    </div>
  );
}
