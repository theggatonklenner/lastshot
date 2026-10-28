import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Input, LinkButton, buttonClass } from "@/components/ui";
import { OrganiserActions } from "./organiser-actions";

export const metadata: Metadata = { title: "Organisers" };

const PAGE = 50;

export default async function AdminOrganisers({ searchParams }: PageProps<"/admin/organisers">) {
  const { supabase, user } = await requireAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(0, Number(sp.page) || 0);
  const { data: rows } = await supabase.rpc("admin_organisers", { p_search: q || null, p_limit: PAGE, p_offset: page * PAGE });
  const total = rows?.[0]?.total_count ?? 0;
  const qs = (p: number) => `?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">Organisers</h1>
      <form className="grid gap-3 sm:grid-cols-[1fr_auto]" role="search">
        <Input name="q" defaultValue={q} placeholder="Search by email or name" aria-label="Search organisers" />
        <button className={buttonClass("primary", "md", "h-12")}>Search</button>
      </form>

      {!rows?.length ? (
        <EmptyState title="No organisers match" />
      ) : (
        <>
          <p className="text-graphite">{total} {total === 1 ? "organiser" : "organisers"}</p>
          <div className="overflow-x-auto rounded-panel border border-line bg-card">
            <table className="w-full min-w-[820px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-graphite">
                <tr>
                  <th className="px-4 py-3 font-semibold">Organiser</th>
                  <th className="px-4 py-3 text-right font-semibold">Events</th>
                  <th className="px-4 py-3 text-right font-semibold">Photos</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3">
                      <span className="block font-semibold break-all">{o.email}</span>
                      <span className="flex flex-wrap gap-1.5 text-sm text-graphite">
                        {o.display_name && <span>{o.display_name}</span>}
                        {o.is_admin && <span className="rounded bg-flash px-1.5 font-semibold text-ink">Admin</span>}
                        {!o.confirmed && <span className="rounded bg-paper-2 px-1.5">Email not confirmed</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right numeric">
                      {o.events ? (
                        <Link href={`/admin/events?q=${encodeURIComponent(o.email)}`} className="font-semibold text-cobalt hover:underline">
                          {o.events}
                        </Link>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-3 text-right numeric">{o.photos}</td>
                    <td className="px-4 py-3 text-graphite">{formatDateTime(o.created_at)}</td>
                    <td className="px-4 py-3 text-graphite">{o.last_sign_in_at ? formatDateTime(o.last_sign_in_at) : "Never"}</td>
                    <td className="px-4 py-3 text-right">
                      {o.id !== user.id && <OrganiserActions userId={o.id} email={o.email} isAdmin={o.is_admin} events={o.events} />}
                    </td>
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
