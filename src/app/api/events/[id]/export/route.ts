import type { NextRequest } from "next/server";
import { ownedEventForApi } from "@/lib/server/organiser";
import { jsonError } from "@/lib/server/http";
import { admin } from "@/lib/supabase/admin";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

function csv(v: string | number | null | undefined) {
  const s = v === null || v === undefined ? "" : String(v);
  // Stop spreadsheet apps treating answers as formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Every guest with their photo count, contacts and answers (Guest data export add-on). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/events/[id]/export">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  const event = owned.event;
  if (!event.addon_export) return jsonError(403, "addon_required", "Add the Guest data export add-on first.");

  const db = admin();
  const [{ data: guests }, { data: emails }, { data: phones }, { data: marketing }] = await Promise.all([
    db
      .from("event_guests")
      .select("id, display_name, created_at, last_active_at, photos_submitted, blocked, lead_answers")
      .eq("event_id", event.id)
      .order("created_at"),
    db.from("guest_emails").select("guest_id, email, unsubscribed_at").eq("event_id", event.id),
    db.from("guest_sms").select("guest_id, phone, unsubscribed_at").eq("event_id", event.id),
    db.from("marketing_contacts").select("channel, contact").eq("event_id", event.id).is("unsubscribed_at", null),
  ]);
  const optedIn = new Set((marketing ?? []).map((m) => `${m.channel}:${m.contact}`));
  const byGuest = <T extends { guest_id: string | null }>(rows: T[] | null) => {
    const m = new Map<string, T[]>();
    for (const r of rows ?? []) if (r.guest_id) m.set(r.guest_id, [...(m.get(r.guest_id) ?? []), r]);
    return m;
  };
  const emailMap = byGuest(emails);
  const phoneMap = byGuest(phones);
  const questions = event.lead_questions ?? [];

  const header = [
    "Name",
    "Joined",
    "Last active",
    "Photos",
    "Email",
    "Mobile",
    "Opted in to marketing",
    ...questions.map((q) => q.label),
    "Blocked",
  ];
  const rows = (guests ?? []).map((g) => {
    const em = (emailMap.get(g.id) ?? []).filter((e) => !e.unsubscribed_at).map((e) => e.email);
    const ph = (phoneMap.get(g.id) ?? []).filter((p) => !p.unsubscribed_at).map((p) => p.phone);
    const opted = em.some((e) => optedIn.has(`email:${e}`)) || ph.some((p) => optedIn.has(`sms:${p}`));
    return [
      g.display_name ?? "",
      g.created_at,
      g.last_active_at,
      g.photos_submitted,
      em.join("; "),
      ph.map(formatPhone).join("; "),
      opted ? "Yes" : "No",
      ...questions.map((q) => g.lead_answers?.[q.id] ?? ""),
      g.blocked ? "Yes" : "No",
    ];
  });
  const body = [header, ...rows].map((r) => r.map(csv).join(",")).join("\n");
  const name = event.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event";
  return new Response("﻿" + body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}-guests.csv"`,
    },
  });
}
