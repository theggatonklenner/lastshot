import { getUser } from "@/lib/supabase/server";
import { csvCell } from "@/lib/safety";
import { jsonError } from "@/lib/server/http";
import { paymentLabel } from "@/lib/plans";

export const dynamic = "force-dynamic";

const csv = csvCell;

/** All of the organiser's payments as a CSV, for bookkeeping. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorised", "Sign in first.");
  const { data } = await supabase
    .from("payments")
    .select("id, paid_at, created_at, kind, plan, addon, addons, extra_guests, amount_cents, currency, status, receipt_email, pack, pack_plan, pack_events, pack_branding, events(title)")
    .in("status", ["paid", "refunded"])
    .order("paid_at", { ascending: false });

  const rows = [["Date", "Event", "Item", "Amount", "Currency", "Status", "Receipt email", "Payment ID"]];
  for (const p of (data ?? []) as unknown as {
    id: string; paid_at: string | null; created_at: string; kind: string; plan: string | null; addon: string | null; addons: string[]; extra_guests: number;
    amount_cents: number; currency: string; status: string; receipt_email: string | null; events: { title: string } | null;
  }[]) {
    rows.push([
      (p.paid_at ?? p.created_at).slice(0, 10),
      p.kind === "pack" ? "Event pack" : (p.events?.title ?? "Deleted event"),
      paymentLabel(p as never),
      (p.amount_cents / 100).toFixed(2),
      p.currency.toUpperCase(),
      p.status,
      p.receipt_email ?? "",
      p.id,
    ]);
  }
  const body = rows.map((r) => r.map(csv).join(",")).join("\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lastshot-payments.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
