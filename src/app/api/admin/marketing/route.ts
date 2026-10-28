import { assertAdmin } from "@/lib/server/admin-auth";
import { csvCell } from "@/lib/safety";
import { admin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const csv = csvCell;

/** Everyone who opted in to news and offers and hasn't unsubscribed, as a CSV. */
export async function GET() {
  try {
    await assertAdmin();
  } catch {
    return new Response("Not allowed", { status: 403 });
  }
  const { data } = await admin()
    .from("marketing_contacts")
    .select("channel, contact, consented_at, consent_text")
    .is("unsubscribed_at", null)
    .order("consented_at", { ascending: false });
  const rows = [["Channel", "Contact", "Opted in", "Agreed to"], ...(data ?? []).map((r) => [r.channel, r.contact, r.consented_at, r.consent_text])];
  return new Response(rows.map((r) => r.map(csv).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="lastshot-marketing-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
