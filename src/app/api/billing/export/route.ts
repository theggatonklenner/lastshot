import { getUser } from "@/lib/supabase/server";
import { jsonError } from "@/lib/server/http";
import { planInfo } from "@/lib/plans";

export const dynamic = "force-dynamic";

function csv(v: string | number | null) {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** All of the organiser's payments as a CSV, for bookkeeping. */
export async function GET() {
  const { supabase, user } = await getUser();
  if (!user) return jsonError(401, "unauthorised", "Sign in first.");
  const { data } = await supabase
    .from("payments")
    .select("id, paid_at, created_at, kind, plan, extra_guests, amount_cents, currency, status, receipt_email, events(title)")
    .in("status", ["paid", "refunded"])
    .order("paid_at", { ascending: false });

  const rows = [["Date", "Event", "Item", "Amount", "Currency", "Status", "Receipt email", "Payment ID"]];
  for (const p of (data ?? []) as unknown as {
    id: string; paid_at: string | null; created_at: string; kind: string; plan: string | null; extra_guests: number;
    amount_cents: number; currency: string; status: string; receipt_email: string | null; events: { title: string } | null;
  }[]) {
    rows.push([
      (p.paid_at ?? p.created_at).slice(0, 10),
      p.events?.title ?? "Deleted event",
      p.kind === "seats" ? `${p.extra_guests} extra seats` : `${planInfo((p.plan ?? "free") as never).name} plan`,
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
