import type { Metadata } from "next";
import { requireOrganiser } from "@/lib/server/organiser";
import { resolveDiscount, savedCode } from "@/lib/server/discounts";
import { Wizard } from "./wizard";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const { supabase, user } = await requireOrganiser("/dashboard/new");
  const [{ data: credits }, withCode, standing] = await Promise.all([
    supabase.from("event_credits").select("id, pack, plan, branding, remaining").eq("owner_id", user.id).gt("remaining", 0).order("created_at"),
    savedCode().then((c) => (c ? resolveDiscount(user.id, c, { eventId: null }) : null)),
    resolveDiscount(user.id, null, { eventId: null }),
  ]);
  const toApplied = (d: Awaited<ReturnType<typeof resolveDiscount>>["discount"] | undefined) =>
    d ? { code: d.code, percent: d.percent, label: d.label } : null;
  const standingDiscount = toApplied(standing.discount);
  return (
    <Wizard
      credits={credits ?? []}
      initialDiscount={toApplied(withCode?.discount) ?? standingDiscount}
      standingDiscount={standingDiscount}
    />
  );
}
