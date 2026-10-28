import "server-only";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";

/**
 * When an event with photos ends, makes a one-time 20% off code for the
 * organiser's next event and emails it. Runs once per event.
 */
export async function sendSecondEventCode(eventId: string) {
  const db = admin();
  const { data: code } = await db.rpc("create_second_event_code", { p_event_id: eventId });
  if (!code?.id || !emailConfigured()) return;
  const [{ data: event }, { data: owner }] = await Promise.all([
    db.from("events").select("title").eq("id", eventId).maybeSingle(),
    db.from("profiles").select("email").eq("id", code.owner_id!).maybeSingle(),
  ]);
  if (!event || !owner?.email) return;
  const mail = organiserNoticeEmail({
    eyebrow: "Thanks for using Lastshot",
    heading: `${code.percent_off}% off your next event`,
    lines: [
      `Hope ${event.title} was a good one. Here's ${code.percent_off}% off whatever you plan next: ${code.code}`,
      "Type it at checkout under \"Have a discount code?\". It works once, on any plan or add-on, for the next 12 months.",
    ],
    buttonLabel: "Plan your next event",
    buttonUrl: `${siteUrl()}/dashboard/new`,
    note: "You can also find this code under Refer a friend in your account menu.",
  });
  await sendBatch([{ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text }], `next-event:${code.id}`);
}
