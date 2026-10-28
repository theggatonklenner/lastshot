import "server-only";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";
import { eventGuestLimit } from "@/lib/plans";

/**
 * Emails the event's creator the first time a guest is turned away because
 * the event is full. Claimed with a conditional update so it sends once.
 */
export async function notifyEventFull(eventId: string) {
  if (!emailConfigured()) return;
  const db = admin();
  const { data: event } = await db
    .from("events")
    .update({ full_notified_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("full_notified_at", null)
    .select("id, title, owner_id, plan, extra_guests")
    .maybeSingle();
  if (!event) return;
  const { data: owner } = await db.from("profiles").select("email").eq("id", event.owner_id).maybeSingle();
  if (!owner?.email) return;
  const limit = eventGuestLimit(event);
  const mail = organiserNoticeEmail({
    eyebrow: "Event full",
    heading: `${event.title} is full`,
    lines: [
      `A guest just tried to join, but all ${limit} cameras for this event are taken.`,
      "Guests who already joined can keep shooting. Upgrade the plan or add extra seats to let more people in. It takes effect straight away.",
    ],
    buttonLabel: "Make room for more guests",
    buttonUrl: `${siteUrl()}/dashboard/events/${event.id}/upgrade`,
  });
  await sendBatch([{ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text }], `full:${event.id}:${event.plan}:${event.extra_guests}`);
}
