import "server-only";
import { createHash } from "node:crypto";
import { esc, renderEmail } from "@/lib/email-layout";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

/**
 * Sends up to 100 emails in one Resend batch call. The idempotency key means a
 * retried request can't send the same batch twice.
 */
export async function sendBatch(
  emails: OutgoingEmail[],
  idempotencyKey?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!emailConfigured()) return { ok: false, error: "Email isn't set up (RESEND_API_KEY and EMAIL_FROM)." };
  if (emails.length === 0) return { ok: true };
  if (emails.length > 100) throw new Error("Resend batches are limited to 100 emails.");

  const from = process.env.EMAIL_FROM!;
  const replyTo = process.env.EMAIL_REPLY_TO || undefined;
  const key = createHash("sha256")
    .update(idempotencyKey ?? emails.map((e) => `${e.to}|${e.subject}`).join("\n"))
    .digest("hex");

  try {
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(
        emails.map((e) => ({
          from,
          to: e.to,
          subject: e.subject,
          html: e.html,
          text: e.text,
          headers: e.headers,
          ...(replyTo ? { reply_to: replyTo } : {}),
        })),
      ),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** The "your photos are ready" email to a guest. */
export function galleryReadyEmail(p: { eventTitle: string; galleryUrl: string; unsubscribeUrl: string; photoCount: number }) {
  const title = esc(p.eventTitle);
  const count = p.photoCount === 1 ? "1 photo" : `${p.photoCount} photos`;
  const subject = `The photos from ${p.eventTitle} are ready`;
  const html = renderEmail({
    theme: "dark",
    preheader: `${count} from everyone's cameras are waiting in the shared gallery.`,
    eyebrow: title,
    heading: "Your photos are developed",
    blocks: [
      { kind: "counter", value: String(p.photoCount).padStart(2, "0"), label: `${p.photoCount === 1 ? "shot" : "shots"} from everyone's<br>cameras on one roll` },
      { kind: "p", html: "The roll is in. Flick through every shot from the night, then save your favourites or download the lot." },
    ],
    button: { label: "Open the gallery", url: esc(p.galleryUrl) },
    note: "This link is just for you. It opens the gallery on any device, no account needed.",
    footer: `You're getting this because you asked to be told when the photos from ${title} were ready. This is the only email we'll send about this event. <a href="${esc(p.unsubscribeUrl)}" style="color:#565962">Unsubscribe</a>`,
  });
  const text = `Your photos from ${p.eventTitle} are ready.

${count} are waiting in the shared gallery:
${p.galleryUrl}

This link is just for you and opens the gallery on any device.

You asked to be emailed when these photos were ready. This is the only email we'll send for this event.
Unsubscribe: ${p.unsubscribeUrl}`;
  return { subject, html, text };
}

/** Short email to an organiser or admin. */
export function organiserNoticeEmail(p: {
  heading: string;
  lines: string[];
  buttonLabel: string;
  buttonUrl: string;
  eyebrow?: string;
  note?: string;
  footer?: string;
}) {
  const html = renderEmail({
    theme: "light",
    preheader: p.lines[0] ?? p.heading,
    eyebrow: p.eyebrow ? esc(p.eyebrow) : undefined,
    heading: esc(p.heading),
    blocks: p.lines.map((l) => ({ kind: "p" as const, html: esc(l) })),
    button: { label: esc(p.buttonLabel), url: esc(p.buttonUrl) },
    note: p.note ? esc(p.note) : undefined,
    footer: esc(p.footer ?? "You're getting this because you organise events on Lastshot."),
  });
  const text = `${p.heading}\n\n${p.lines.join("\n\n")}\n\n${p.buttonLabel}: ${p.buttonUrl}`;
  return { subject: p.heading, html, text };
}
