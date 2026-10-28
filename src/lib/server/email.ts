import "server-only";
import { createHash } from "node:crypto";

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

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** The "your photos are ready" email. Plain table layout so it renders in every mail app. */
export function galleryReadyEmail(p: { eventTitle: string; galleryUrl: string; unsubscribeUrl: string; photoCount: number }) {
  const title = esc(p.eventTitle);
  const count = p.photoCount === 1 ? "1 photo" : `${p.photoCount} photos`;
  const subject = `The photos from ${p.eventTitle} are ready`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f0;font-family:Arial,Helvetica,sans-serif;color:#16171a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f0;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1d1e21;border-radius:20px;overflow:hidden">
<tr><td style="background:#2546d8;padding:18px 28px;color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.3px">lastshot</td></tr>
<tr><td style="padding:32px 28px 8px;color:#f1ecdf">
<p style="margin:0 0 6px;font-size:15px;color:#b9b4a7">${title}</p>
<h1 style="margin:0 0 16px;font-size:30px;line-height:1.1;color:#f1ecdf">Your photos are ready</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#f1ecdf">The roll has been developed. ${count} from everyone's cameras are waiting in the shared gallery.</p>
</td></tr>
<tr><td style="padding:0 28px 32px">
<a href="${esc(p.galleryUrl)}" style="display:inline-block;background:#ffd23f;color:#1d1e21;text-decoration:none;font-weight:bold;font-size:17px;padding:15px 28px;border-radius:999px">See and download the photos</a>
<p style="margin:20px 0 0;font-size:13px;line-height:1.5;color:#b9b4a7">This link is just for you. It opens the gallery on any device.</p>
</td></tr>
</table>
<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#565962">
You're getting this because you asked to be emailed when the photos from ${title} were ready. This is the only email we'll send for this event.
<a href="${esc(p.unsubscribeUrl)}" style="color:#565962">Unsubscribe</a>
</p>
</td></tr></table>
</body></html>`;
  const text = `Your photos from ${p.eventTitle} are ready.

${count} are waiting in the shared gallery:
${p.galleryUrl}

This link is just for you and opens the gallery on any device.

You asked to be emailed when these photos were ready. This is the only email we'll send for this event.
Unsubscribe: ${p.unsubscribeUrl}`;
  return { subject, html, text };
}
