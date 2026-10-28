import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/server/email";
import { formatDateTime } from "@/lib/format";
import { Notice, Panel, StatusPill } from "@/components/ui";

type Overview = {
  organisers: number;
  signups_7d: number;
  events: number;
  events_by_status: Record<string, number>;
  events_suspended: number;
  guests: number;
  photos: number;
  photos_24h: number;
  photos_pending_review: number;
  photos_flagged: number;
  original_bytes: number;
  emails_waiting: number;
  emails_sent: number;
  emails_failed: number;
  emails_unsubscribed: number;
};

function bytes(n: number) {
  // Originals plus display and thumbnail copies are roughly 1.35x the original size.
  const total = n * 1.35;
  if (total < 1024 ** 2) return `${Math.round(total / 1024)} KB`;
  if (total < 1024 ** 3) return `${(total / 1024 ** 2).toFixed(1)} MB`;
  return `${(total / 1024 ** 3).toFixed(2)} GB`;
}

export default async function AdminOverview() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: recent }] = await Promise.all([
    supabase.rpc("admin_overview"),
    supabase.rpc("admin_events", { p_search: null, p_status: null, p_limit: 8, p_offset: 0 }),
  ]);
  const o = data as unknown as Overview;
  const { count: openErrors } = await admin()
    .from("app_errors")
    .select("id", { count: "exact", head: true })
    .is("resolved_at", null);

  const statuses = ["draft", "published", "active", "ended", "archived"];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">Overview</h1>

      {!emailConfigured() && (
        <Notice tone="warn">
          Email sending isn&apos;t configured. Add RESEND_API_KEY and EMAIL_FROM in Vercel so guests get their gallery links.
        </Notice>
      )}
      {!!openErrors && (
        <Notice tone="error" action={<Link href="/admin/errors" className="font-semibold underline">Review</Link>}>
          {openErrors} unresolved {openErrors === 1 ? "error" : "errors"}.
        </Notice>
      )}
      {o.emails_failed > 0 && (
        <Notice tone="error" action={<Link href="/admin/emails" className="font-semibold underline">Review</Link>}>
          {o.emails_failed} gallery {o.emails_failed === 1 ? "email has" : "emails have"} failed to send.
        </Notice>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
        <Stat label="Organisers" value={o.organisers} sub={`${o.signups_7d} new this week`} />
        <Stat label="Events" value={o.events} sub={o.events_suspended ? `${o.events_suspended} suspended` : "None suspended"} />
        <Stat label="Photos" value={o.photos} sub={`${o.photos_24h} in the last 24 hours`} />
        <Stat label="Storage used" value={bytes(o.original_bytes)} sub="Estimate, all sizes" />
        <Stat label="Guests" value={o.guests} sub="Camera IDs" />
        <Stat label="Waiting for review" value={o.photos_pending_review} sub={`${o.photos_flagged} flagged`} />
        <Stat label="Emails sent" value={o.emails_sent} sub={`${o.emails_waiting} waiting`} />
        <Stat label="Unsubscribed" value={o.emails_unsubscribed} sub={`${o.emails_failed} failed`} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Events by status</h2>
          <ul className="flex flex-col gap-3">
            {statuses.map((s) => (
              <li key={s} className="flex items-center justify-between">
                <Link href={`/admin/events?status=${s}`} className="hover:underline">
                  <StatusPill status={s} />
                </Link>
                <span className="font-semibold numeric">{o.events_by_status[s] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Newest events</h2>
            <Link href="/admin/events" className="font-semibold text-cobalt hover:underline">
              All events
            </Link>
          </div>
          {recent?.length ? (
            <ul className="divide-y divide-line">
              {recent.map((e) => (
                <li key={e.id}>
                  <Link href={`/admin/events/${e.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-paper/60">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{e.title}</span>
                      <span className="block truncate text-sm text-graphite">
                        {e.owner_email}, {formatDateTime(e.created_at)}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm text-graphite numeric">{e.photos} photos</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-graphite">No events yet.</p>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="display text-3xl numeric">{value}</dd>
      <dd className="text-sm text-graphite">{sub}</dd>
    </div>
  );
}
