import "server-only";
import { admin } from "@/lib/supabase/admin";
import { servedPath, signPaths } from "@/lib/server/media";
import { siteUrl } from "@/lib/env";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";
import type { EventRecord } from "@/lib/database.types";

export type Wrapped = {
  photos: number;
  shooters: number;
  guests: number;
  firstAt: string | null;
  lastAt: string | null;
  busiestStart: string | null;
  busiestCount: number;
  topName: string | null;
  topCount: number;
  /** Signed display URLs for a few photos from across the night. */
  pictures: string[];
};

type Raw = {
  photos: number;
  shooters: number;
  guests: number;
  first_at: string | null;
  last_at: string | null;
  busiest_start: string | null;
  busiest_count: number | null;
  top_name: string | null;
  top_count: number | null;
  show_names: boolean;
  pick_ids: string[];
};

/** The night in numbers, with a handful of photos. */
export async function loadWrapped(event: EventRecord): Promise<Wrapped> {
  const db = admin();
  const { data } = await db.rpc("event_wrapped", { p_event_id: event.id });
  const w = (data ?? {}) as Raw;
  const ids = (w.pick_ids ?? []).slice(0, 5);
  let pictures: string[] = [];
  if (ids.length) {
    const { data: rows } = await db.from("photos").select("id, display_path, watermarked").in("id", ids);
    const signed = await signPaths((rows ?? []).map((r) => servedPath(r.display_path, r, event)), 60 * 60 * 6);
    pictures = signed.filter((u): u is string => !!u);
  }
  return {
    photos: w.photos ?? 0,
    shooters: w.shooters ?? 0,
    guests: w.guests ?? 0,
    firstAt: w.first_at ?? null,
    lastAt: w.last_at ?? null,
    busiestStart: w.busiest_start ?? null,
    busiestCount: w.busiest_count ?? 0,
    topName: w.show_names ? (w.top_name ?? null) : null,
    topCount: w.top_count ?? 0,
    pictures,
  };
}

/** Local hour in the event's time zone. */
function localHour(d: Date, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone }).format(d));
}
function localDay(d: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(d);
}

/**
 * Emails organisers their Event Wrapped from 9am (event time) the day after
 * the event ended. Claimed with a conditional update so each sends once.
 */
export async function sendDueWrapped(limit = 30) {
  if (!emailConfigured()) return { sent: 0 };
  const db = admin();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: events } = await db
    .from("events")
    .select("id, title, code, owner_id, timezone, ended_at, status")
    .in("status", ["ended", "archived"])
    .is("wrapped_sent_at", null)
    .gte("ended_at", since)
    .limit(limit);
  let sent = 0;
  const now = new Date();
  for (const e of events ?? []) {
    if (!e.ended_at) continue;
    const tz = e.timezone || "Australia/Sydney";
    const due = localDay(now, tz) > localDay(new Date(e.ended_at), tz) && localHour(now, tz) >= 9;
    if (!due) continue;
    const { data: claimed } = await db
      .from("events")
      .update({ wrapped_sent_at: now.toISOString() })
      .eq("id", e.id)
      .is("wrapped_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;
    const { data: stats } = await db.rpc("event_wrapped", { p_event_id: e.id });
    const w = (stats ?? {}) as Raw;
    if (!w.photos) continue;
    const { data: owner } = await db.from("profiles").select("email").eq("id", e.owner_id).maybeSingle();
    if (!owner?.email) continue;
    const mail = organiserNoticeEmail({
      eyebrow: "Event Wrapped",
      heading: `${e.title}, wrapped`,
      lines: [
        `${w.photos} ${w.photos === 1 ? "photo" : "photos"} from ${w.shooters} ${w.shooters === 1 ? "guest" : "guests"}.`,
        "See the busiest moment of the night, who took the most shots, and a card you can share.",
      ],
      buttonLabel: "See your night, wrapped",
      buttonUrl: `${siteUrl()}/e/${e.code}/wrapped`,
    });
    const res = await sendBatch([{ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text }], `wrapped:${e.id}`);
    if (res.ok) sent++;
  }
  return { sent };
}
