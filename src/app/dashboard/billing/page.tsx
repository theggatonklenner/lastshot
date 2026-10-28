import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganiser } from "@/lib/server/organiser";
import { stripeConfigured } from "@/lib/server/stripe";
import { formatPrice, paymentLabel } from "@/lib/plans";
import { formatDateTime } from "@/lib/format";
import { EmptyState, Panel, buttonClass, cx } from "@/components/ui";
import type { Addon, Plan } from "@/lib/database.types";

export const metadata: Metadata = { title: "Billing" };

type Row = {
  id: string;
  paid_at: string | null;
  created_at: string;
  kind: "plan" | "seats" | "addon" | "bundle";
  addon: Addon | null;
  addons: Addon[];
  plan: Plan | null;
  extra_guests: number;
  amount_cents: number;
  status: "paid" | "refunded";
  receipt_email: string | null;
  user_id: string | null;
  event_id: string | null;
  events: { title: string } | null;
};

export default async function BillingPage() {
  const { supabase, user } = await requireOrganiser("/dashboard/billing");
  const { data } = await supabase
    .from("payments")
    .select("id, paid_at, created_at, kind, plan, addon, addons, extra_guests, amount_cents, status, receipt_email, user_id, event_id, events(title)")
    .in("status", ["paid", "refunded"])
    .order("paid_at", { ascending: false });
  const rows = (data ?? []) as unknown as Row[];
  const mine = rows.filter((r) => r.user_id === user.id);
  const paid = mine.filter((r) => r.status === "paid");
  const year = new Date().getFullYear();
  const total = paid.reduce((n, r) => n + r.amount_cents, 0);
  const thisYear = paid.filter((r) => (r.paid_at ?? r.created_at).startsWith(String(year))).reduce((n, r) => n + r.amount_cents, 0);
  const docs = stripeConfigured();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display-md text-[clamp(28px,4vw,40px)]">Billing</h1>
          <p className="text-graphite">Every payment for your events, with invoices and receipts.</p>
        </div>
        {!!rows.length && (
          // A file download, so a plain link rather than client navigation.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/billing/export" download className={buttonClass("secondary", "sm")}>
            Download CSV
          </a>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-3">
        <Stat label="Total spent" value={formatPrice(total).replace("Free", "$0")} sub="AUD, all time" />
        <Stat label={`Spent in ${year}`} value={formatPrice(thisYear).replace("Free", "$0")} sub="AUD" />
        <Stat label="Payments" value={String(paid.length)} sub={paid.length === 1 ? "payment" : "payments"} />
      </dl>

      {rows.length === 0 ? (
        <EmptyState
          title="No payments yet"
          action={
            <Link href="/dashboard" className={buttonClass("primary")}>
              Go to your events
            </Link>
          }
        >
          Events start free for up to 10 guests. When you upgrade an event or add seats, the invoice shows up here.
        </EmptyState>
      ) : (
        <>
        {/* Phones: one card per payment */}
        <ul className="flex flex-col gap-2 sm:hidden">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-panel border border-line bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{r.events?.title ?? "Deleted event"}</p>
                  <p className="text-sm text-graphite">
                    {itemName(r)} ·{" "}
                    {formatDateTime(r.paid_at ?? r.created_at)}
                  </p>
                </div>
                <span className="shrink-0 text-right numeric">
                  <span className={cx("font-semibold", r.status === "refunded" && "text-graphite line-through")}>
                    {formatPrice(r.amount_cents)}
                  </span>
                  {r.status === "refunded" && <span className="block text-xs text-graphite">Refunded</span>}
                </span>
              </div>
              {docs && (
                <span className="flex gap-4 text-sm font-semibold">
                  <a href={`/api/billing/${r.id}/invoice`} target="_blank" rel="noopener" className="text-cobalt">
                    Invoice
                  </a>
                  <a href={`/api/billing/${r.id}/pdf`} className="text-cobalt">
                    PDF
                  </a>
                  <a href={`/api/billing/${r.id}/receipt`} target="_blank" rel="noopener" className="text-cobalt">
                    Receipt
                  </a>
                </span>
              )}
            </li>
          ))}
        </ul>
        <Panel className="hidden p-0 sm:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-graphite">
                <tr>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Event</th>
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-5 py-3 text-right font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3.5 whitespace-nowrap">{formatDateTime(r.paid_at ?? r.created_at)}</td>
                    <td className="px-5 py-3.5">
                      {r.event_id && r.events ? (
                        <Link href={`/dashboard/events/${r.event_id}/upgrade`} className="font-semibold hover:text-cobalt">
                          {r.events.title}
                        </Link>
                      ) : (
                        <span className="text-graphite">Deleted event</span>
                      )}
                      {r.user_id !== user.id && <span className="block text-sm text-graphite">Paid by a co-organiser</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      {itemName(r)}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap numeric">
                      <span className={cx("font-semibold", r.status === "refunded" && "text-graphite line-through")}>
                        {formatPrice(r.amount_cents)}
                      </span>
                      {r.status === "refunded" && (
                        <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-xs font-semibold text-graphite">Refunded</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {docs ? (
                        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                          <a href={`/api/billing/${r.id}/invoice`} target="_blank" rel="noopener" className="text-cobalt hover:underline">
                            Invoice
                          </a>
                          <a href={`/api/billing/${r.id}/pdf`} className="text-cobalt hover:underline">
                            PDF
                          </a>
                          <a href={`/api/billing/${r.id}/receipt`} target="_blank" rel="noopener" className="text-cobalt hover:underline">
                            Receipt
                          </a>
                        </span>
                      ) : (
                        <span className="text-sm text-graphite">Not available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        </>
      )}

      <Panel>
        <h2 className="mb-2 text-lg font-bold">How billing works</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-graphite">
          <li>You pay once per event when you upgrade it or add seats. There&apos;s no subscription and nothing renews.</li>
          <li>Payments are handled by Stripe. Lastshot never sees or stores your card details.</li>
          <li>Prices are in Australian dollars. Each invoice is also emailed to you when you pay.</li>
          <li>
            For a refund or a question about a charge, email{" "}
            <span className="font-semibold text-ink">support@lastshot.app</span> with the event name.
          </li>
        </ul>
      </Panel>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-5">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="display text-3xl numeric">{value}</dd>
      <dd className="text-sm text-graphite">{sub}</dd>
    </div>
  );
}

function itemName(r: Row) {
  return paymentLabel(r);
}
