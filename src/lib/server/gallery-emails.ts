import "server-only";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { createHmac } from "node:crypto";
import { hashToken } from "@/lib/server/guest";
import { emailConfigured, galleryReadyEmail, sendBatch } from "@/lib/server/email";
import { galleryReadySms, sendSmsBatch, smsConfigured } from "@/lib/server/sms";

/**
 * Each email's private link is derived from a server secret and the row id, so
 * a retried send produces exactly the same link. Rotating LINK_SECRET (or the
 * Supabase secret key when LINK_SECRET is unset) invalidates links already sent.
 */
function linkToken(rowId: string): string {
  const secret = process.env.LINK_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No secret available to sign gallery links.");
  return createHmac("sha256", secret).update(`gallery-link:${rowId}`).digest("base64url");
}

export type SendSummary = {
  claimed: number;
  sent: number;
  failed: number;
  skipped?: "not_configured";
  sms?: { claimed: number; sent: number; failed: number; skipped?: "not_configured" };
};

/**
 * Sends "photos are ready" emails that are due. Safe to call often and from
 * several places at once: Postgres hands each email to exactly one caller.
 */
export async function sendDueGalleryEmails(opts: { eventId?: string; limit?: number } = {}): Promise<SendSummary> {
  // Texts go out alongside emails (SMS alerts add-on).
  const sms = await sendDueGallerySms(opts).catch((e) => {
    console.error("gallery sms failed", e);
    return { claimed: 0, sent: 0, failed: 0 };
  });
  const email = await sendDueEmailsOnly(opts);
  return { ...email, sms };
}

async function sendDueEmailsOnly(opts: { eventId?: string; limit?: number }): Promise<SendSummary> {
  if (!emailConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: "not_configured" };

  const db = admin();
  const { data: claimed, error } = await db.rpc("claim_gallery_emails", {
    p_event_id: opts.eventId ?? null,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw new Error(`claim failed: ${error.message}`);
  const rows = claimed ?? [];
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  // Approved photo counts per event, for the email copy.
  const counts = new Map<string, number>();
  for (const eventId of new Set(rows.map((r) => r.event_id))) {
    const { count } = await db
      .from("photos")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("upload_status", "complete")
      .eq("moderation_status", "approved");
    counts.set(eventId, count ?? 0);
  }

  const base = siteUrl();
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => {
      const token = linkToken(r.id);
      const galleryUrl = `${base}/e/${r.event_code}/g/${token}`;
      const unsubscribeUrl = `${base}/e/${r.event_code}/unsubscribe/${token}`;
      return { row: r, hash: hashToken(token), unsubscribeUrl, mail: galleryReadyEmail({
        eventTitle: r.event_title,
        galleryUrl,
        unsubscribeUrl,
        photoCount: counts.get(r.event_id) ?? 0,
      }) };
    });

    // Store the link's hash before sending, so the link works the moment it arrives.
    for (const b of batch) {
      await db.from("guest_emails").update({ view_token_hash: b.hash }).eq("id", b.row.id);
    }

    // Same rows => same key for 24 hours, so a send that timed out but actually
    // went through is never repeated.
    const result = await sendBatch(
      batch.map((b) => ({
        to: b.row.email,
        subject: b.mail.subject,
        html: b.mail.html,
        text: b.mail.text,
        headers: { "List-Unsubscribe": `<${b.unsubscribeUrl}>` },
      })),
      `gallery-ready:${batch.map((b) => b.row.id).sort().join(",")}`,
    );

    const ids = batch.map((b) => b.row.id);
    if (result.ok) {
      await db
        .from("guest_emails")
        .update({ sent_at: new Date().toISOString(), sending_started_at: null, last_error: null })
        .in("id", ids);
      sent += ids.length;
    } else {
      await db.from("guest_emails").update({ sending_started_at: null, last_error: result.error.slice(0, 500) }).in("id", ids);
      failed += ids.length;
      console.error("gallery email batch failed", result.error);
    }
  }

  return { claimed: rows.length, sent, failed };
}

/** Sends "photos are ready" texts that are due. Same claiming rules as emails. */
export async function sendDueGallerySms(opts: { eventId?: string; limit?: number } = {}) {
  if (!smsConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: "not_configured" as const };
  const db = admin();
  const { data: claimed, error } = await db.rpc("claim_gallery_sms", {
    p_event_id: opts.eventId ?? null,
    p_limit: opts.limit ?? 200,
  });
  if (error) throw new Error(`sms claim failed: ${error.message}`);
  const rows = claimed ?? [];
  if (rows.length === 0) return { claimed: 0, sent: 0, failed: 0 };

  const base = siteUrl();
  const batch = rows.map((r) => {
    const token = linkToken(r.id);
    return { row: r, hash: hashToken(token), body: galleryReadySms(r.event_title, `${base}/e/${r.event_code}/g/${token}`) };
  });
  for (const b of batch) {
    await db.from("guest_sms").update({ view_token_hash: b.hash }).eq("id", b.row.id);
  }

  const result = await sendSmsBatch(batch.map((b) => ({ to: b.row.phone, body: b.body, ref: b.row.id })));
  if (!result.ok) {
    await db
      .from("guest_sms")
      .update({ sending_started_at: null, last_error: result.error.slice(0, 500) })
      .in("id", rows.map((r) => r.id));
    return { claimed: rows.length, sent: 0, failed: rows.length };
  }
  const sentIds = rows.filter((r) => result.accepted.has(r.id)).map((r) => r.id);
  if (sentIds.length) {
    await db.from("guest_sms").update({ sent_at: new Date().toISOString(), sending_started_at: null, last_error: null }).in("id", sentIds);
  }
  for (const r of rows.filter((x) => !result.accepted.has(x.id))) {
    await db
      .from("guest_sms")
      .update({ sending_started_at: null, last_error: (result.errors.get(r.id) ?? "Not accepted").slice(0, 500) })
      .eq("id", r.id);
  }
  return { claimed: rows.length, sent: sentIds.length, failed: rows.length - sentIds.length };
}
