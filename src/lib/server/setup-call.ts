import "server-only";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";
import { formatEventDate } from "@/lib/format";
import { planInfo } from "@/lib/plans";

/**
 * Setup call add-on paid: emails the Lastshot admins the organiser's details
 * so they can get in touch, and tells the organiser what happens next.
 * The idempotency key means a repeat (webhook and success page) sends once.
 */
export async function notifySetupCall(paymentId: string, eventId: string, userId: string) {
  if (!emailConfigured()) return;
  const db = admin();
  const [{ data: event }, { data: owner }, { data: admins }] = await Promise.all([
    db.from("events").select("id, title, event_date, start_time, end_time, plan").eq("id", eventId).maybeSingle(),
    db.from("profiles").select("email, display_name").eq("id", userId).maybeSingle(),
    db.from("profiles").select("email").eq("is_admin", true),
  ]);
  if (!event || !owner?.email) return;
  const who = owner.display_name ? `${owner.display_name} (${owner.email})` : owner.email;
  const when = event.event_date ? formatEventDate(event.event_date, event.start_time, event.end_time) : "No date set yet";

  const toAdmin = organiserNoticeEmail({
    eyebrow: "Setup call booked",
    heading: `Setup call: ${event.title}`,
    lines: [
      `${who} paid for a setup call. Email them to find a time.`,
      `Event: ${event.title}. Date: ${when}. Plan: ${planInfo(event.plan).name}.`,
      `Reply to: ${owner.email}`,
    ],
    buttonLabel: "Open the event in admin",
    buttonUrl: `${siteUrl()}/admin/events/${event.id}`,
    footer: "You're getting this because you're a Lastshot admin.",
  });
  const toOrganiser = organiserNoticeEmail({
    eyebrow: "Setup call",
    heading: "Your setup call is booked in",
    lines: [
      `Thanks for adding a setup call for ${event.title}.`,
      "We'll email you within one business day to find a time that suits. It takes about 15 minutes, and we'll go through the camera, the gallery and the sign together.",
      "If there's anything you want to cover, just reply to this email.",
    ],
    buttonLabel: "Open your event",
    buttonUrl: `${siteUrl()}/dashboard/events/${event.id}`,
  });

  const mails = [
    ...(admins ?? []).filter((a) => a.email).map((a) => ({ to: a.email, subject: toAdmin.subject, html: toAdmin.html, text: toAdmin.text })),
    { to: owner.email, subject: toOrganiser.subject, html: toOrganiser.html, text: toOrganiser.text },
  ];
  await sendBatch(mails, `setup-call:${paymentId}`);
}
