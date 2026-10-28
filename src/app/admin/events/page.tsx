import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Input, LinkButton, Notice, Select, StatusPill, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Events" };

const PAGE = 50;

export default async function AdminEvents({ searchParams }: PageProps<"/admin/events">) {
  const { supabase } = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const page = Math.max(0, Number(sp.page) || 0);

  const { data: rows } = await supabase.rpc("admin_events", {
    p_search: q || null,
    p_status: status || null,
    p_limit: PAGE,
    p_offset: page * PAGE,
  });
  const total = rows?.[0]?.total_count ?? 0;
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">Events</h1>
      {sp.deleted && <Notice tone="success">Event deleted with all its photos.</Notice>}

      <form className="grid gap-3 sm:grid-cols-[1fr_200px_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="Search by title, organiser email or event code" aria-label="Search events" />
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="">Any status</option>
          <option value="draft">Draft</option>
          <option value="published">Ready for guests</option>
          <option value="active">Shooting</option>
          <option value="ended">Ended</option>
          <option value="archived">Archived</option>
          <option value="suspended">Suspended</option>
        </Select>
        <button className={buttonClass("primary", "md", "h-12")}>Search</button>
      </form>

      {!rows?.length ? (
        <EmptyState title="No events match">Try a different search or status.</EmptyState>
      ) : (
        <>
          <p className="text-graphite">{total} {total === 1 ? "event" : "events"}</p>
          <div className="overflow-x-auto rounded-panel border border-line bg-card">
            <table className="w-full min-w-[760px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-graphite">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">Organiser</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Guests</th>
                  <th className="px-4 py-3 text-right font-semibold">Photos</th>
                  <th className="px-4 py-3 text-right font-semibold">Emails</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((e) => (
                  <tr key={e.id} className={e.suspended_at ? "bg-signal-soft/40" : undefined}>
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${e.id}`} className="font-semibold text-cobalt hover:underline">
                        {e.title}
                      </Link>
                      <span className="block text-sm text-graphite numeric">{e.code}</span>
                    </td>
                    <td className="px-4 py-3 break-all text-graphite">{e.owner_email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <StatusPill status={e.status} />
                        {e.suspended_at && <span className="rounded-full bg-signal px-2 py-0.5 text-sm font-semibold text-white">Suspended</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right numeric">{e.guests}</td>
                    <td className="px-4 py-3 text-right numeric">{e.photos}</td>
                    <td className="px-4 py-3 text-right numeric">{e.emails}</td>
                    <td className="px-4 py-3 text-graphite">{formatDateTime(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            {page > 0 && <LinkButton href={qs(page - 1)} variant="secondary" size="sm">Previous</LinkButton>}
            {(page + 1) * PAGE < total && <LinkButton href={qs(page + 1)} variant="secondary" size="sm">Next</LinkButton>}
          </div>
        </>
      )}
    </div>
  );
}
