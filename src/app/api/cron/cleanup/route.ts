import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { rateLimit } from "@/lib/server/guest";
import { cronAuthorised } from "@/lib/server/cron-auth";
import { deleteEventsCompletely } from "@/lib/server/cleanup";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";

export const maxDuration = 60;

const dateFmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Sydney" });

/**
 * Daily housekeeping, called by Supabase pg_cron:
 * 1. warn organisers two weeks before their photos are auto-deleted
 * 2. delete events that are past their retention date
 */
async function run(req: NextRequest) {
  if (!cronAuthorised(req)) return Response.json({ ok: false }, { status: 401 });
  if (!(await rateLimit("cron:cleanup", 4, 3600))) return Response.json({ ok: false }, { status: 429 });
  const db = admin();

  // 1. Warnings
  let warned = 0;
  if (emailConfigured()) {
    const { data: due } = await db.rpc("events_due_for_retention_warning", { p_limit: 100 });
    const owners = new Map<string, string>();
    if (due?.length) {
      const { data: profiles } = await db.from("profiles").select("id, email").in("id", [...new Set(due.map((d) => d.owner_id))]);
      for (const p of profiles ?? []) owners.set(p.id, p.email);
    }
    for (const e of due ?? []) {
      const to = owners.get(e.owner_id);
      if (!to) continue;
      const mail = organiserNoticeEmail({
        heading: `Photos from ${e.title} will be deleted on ${dateFmt.format(new Date(e.delete_after))}`,
        lines: [
          "Lastshot keeps photos for 180 days after an event ends, then deletes them to keep everyone's photos private.",
          "Download anything you want to keep, or choose to keep the photos for longer in your event settings.",
        ],
        eyebrow: "Two weeks left",
        buttonLabel: "Open the event",
        buttonUrl: `${siteUrl()}/dashboard/events/${e.id}/settings`,
      });
      const res = await sendBatch([{ to, subject: mail.subject, html: mail.html, text: mail.text }], `retention:${e.id}`);
      if (res.ok) {
        await db.from("events").update({ retention_warned_at: new Date().toISOString() }).eq("id", e.id);
        warned++;
      }
    }
  }

  // 2. Cleanup (in small batches; tomorrow's run picks up the rest)
  const { data: expired } = await db.rpc("events_due_for_cleanup", { p_limit: 20 });
  let deleted = 0;
  for (const e of expired ?? []) {
    try {
      await deleteEventsCompletely([e.id]);
      deleted++;
    } catch (err) {
      console.error("cleanup failed for event", e.id, err);
    }
  }

  return Response.json({ ok: true, warned, deleted });
}

export const GET = run;
export const POST = run;
