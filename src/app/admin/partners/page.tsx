import type { Metadata } from "next";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { formatPrice } from "@/lib/plans";
import { formatDateTime } from "@/lib/format";
import { CodeForm, CodeToggle, PartnerEditor } from "./partner-tools";

export const metadata: Metadata = { title: "Partners and codes" };

export default async function AdminPartners() {
  await requireAdmin();
  const db = admin();
  const [{ data: partners }, { data: payments }, { data: codes }, { data: customers }, { data: credits }] = await Promise.all([
    db.from("partners").select("*").order("created_at", { ascending: false }),
    db.from("payments").select("partner_id, amount_cents, discount_cents, discount_code_id, paid_at, status").eq("status", "paid"),
    db
      .from("discount_codes")
      .select("id, code, kind, percent_off, uses, max_uses, expires_at, active, partner_id, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    db.from("profiles").select("partner_id").not("partner_id", "is", null),
    db.from("event_credits").select("total, remaining"),
  ]);
  const host = siteUrl().replace(/^https?:\/\//, "");

  const thisMonth = new Date().toISOString().slice(0, 7);
  const stats = new Map<string, { revenue: number; month: number; orders: number; customers: number }>();
  for (const p of partners ?? []) stats.set(p.id, { revenue: 0, month: 0, orders: 0, customers: 0 });
  for (const pay of payments ?? []) {
    const s = pay.partner_id ? stats.get(pay.partner_id) : null;
    if (!s) continue;
    s.revenue += pay.amount_cents;
    s.orders += 1;
    if ((pay.paid_at ?? "").startsWith(thisMonth)) s.month += pay.amount_cents;
  }
  for (const c of customers ?? []) {
    const s = c.partner_id ? stats.get(c.partner_id) : null;
    if (s) s.customers += 1;
  }

  const byKind = (k: string) => (codes ?? []).filter((c) => c.kind === k);
  const discountTotal = (payments ?? []).reduce((n, p) => n + p.discount_cents, 0);
  const codeOrders = (payments ?? []).filter((p) => p.discount_code_id).length;
  const packEvents = (credits ?? []).reduce((n, c) => n + c.total, 0);
  const packLeft = (credits ?? []).reduce((n, c) => n + c.remaining, 0);

  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
        {[
          ["Discounts given", formatPrice(discountTotal).replace("Free", "$0")],
          ["Orders with a code", String(codeOrders)],
          ["Referral rewards", String(byKind("reward").length)],
          ["Pack events sold", `${packEvents} (${packLeft} unused)`],
        ].map(([k, v]) => (
          <div key={k} className="bg-card p-4">
            <dt className="text-sm text-graphite">{k}</dt>
            <dd className="display text-2xl numeric">{v}</dd>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold">Venue partners</h2>
          <p className="text-graphite">
            Each venue gets a page at {host}/their-name and a code. Their customers get the discount, and every order they
            make is tracked here for the venue&apos;s share.
          </p>
        </div>
        <PartnerEditor partner={null} host={host} />
        {(partners ?? []).length === 0 ? (
          <p className="text-graphite">No partners yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {partners!.map((p) => {
              const s = stats.get(p.id)!;
              const code = (codes ?? []).find((c) => c.partner_id === p.id && c.kind === "partner");
              return (
                <li key={p.id} className="flex flex-col gap-3 rounded-panel border border-line bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-bold">
                        {p.name} {!p.active && <span className="text-sm font-semibold text-signal">Paused</span>}
                      </p>
                      <a href={`/${p.slug}`} target="_blank" rel="noopener" className="text-sm font-semibold text-cobalt hover:underline">
                        {host}/{p.slug}
                      </a>
                      <p className="text-sm text-graphite">
                        Code {code?.code ?? "none"} · {p.discount_percent}% off for customers · {p.revenue_share_percent}% share
                        {p.contact_email ? ` · ${p.contact_email}` : ""}
                      </p>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                      <Stat k="Customers" v={String(s.customers)} />
                      <Stat k="Orders" v={String(s.orders)} />
                      <Stat k="Revenue" v={formatPrice(s.revenue).replace("Free", "$0")} />
                      <Stat
                        k="Share owed (all time)"
                        v={formatPrice(Math.round((s.revenue * p.revenue_share_percent) / 100)).replace("Free", "$0")}
                      />
                      <Stat k="This month" v={formatPrice(s.month).replace("Free", "$0")} />
                      <Stat k="Share this month" v={formatPrice(Math.round((s.month * p.revenue_share_percent) / 100)).replace("Free", "$0")} />
                    </dl>
                  </div>
                  <PartnerEditor partner={p} host={host} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold">Discount codes</h2>
          <p className="text-graphite">Make a promo code anyone can use. Referral, reward and next-event codes are made automatically.</p>
        </div>
        <CodeForm />
        <div className="overflow-x-auto rounded-panel border border-line bg-card">
          <table className="w-full min-w-[640px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-graphite">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">Off</th>
                <th className="px-4 py-2.5 font-semibold">Used</th>
                <th className="px-4 py-2.5 font-semibold">Expires</th>
                <th className="px-4 py-2.5 font-semibold" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(codes ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2.5 font-mono">{c.code}</td>
                  <td className="px-4 py-2.5">{KIND[c.kind]}</td>
                  <td className="px-4 py-2.5 numeric">{c.percent_off}%</td>
                  <td className="px-4 py-2.5 numeric">
                    {c.uses}
                    {c.max_uses ? ` of ${c.max_uses}` : ""}
                  </td>
                  <td className="px-4 py-2.5">{c.expires_at ? formatDateTime(c.expires_at) : "Never"}</td>
                  <td className="px-4 py-2.5 text-right">{c.kind !== "partner" && <CodeToggle id={c.id} active={c.active} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const KIND: Record<string, string> = {
  referral: "Referral",
  reward: "Referral reward",
  second_event: "Next event",
  partner: "Venue",
  manual: "Promo",
};

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-graphite">{k}</dt>
      <dd className="font-semibold numeric">{v}</dd>
    </div>
  );
}
