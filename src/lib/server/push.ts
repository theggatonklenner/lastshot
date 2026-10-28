import "server-only";
import webpush from "web-push";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";

/**
 * Web push keys. Made once and kept in the database (app_secrets), so there's
 * nothing to set up in Vercel. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY env vars
 * take priority if they're ever set.
 */
let cached: { publicKey: string; privateKey: string } | null = null;

export async function pushKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const db = admin();
  const read = async () => {
    const { data } = await db.from("app_secrets").select("key, value").in("key", ["vapid_public", "vapid_private"]);
    const m = new Map((data ?? []).map((r) => [r.key, r.value]));
    return m.get("vapid_public") && m.get("vapid_private")
      ? { publicKey: m.get("vapid_public")!, privateKey: m.get("vapid_private")! }
      : null;
  };
  let keys = await read();
  if (!keys) {
    const fresh = webpush.generateVAPIDKeys();
    // If two requests race, the first insert wins and both read it back.
    await db.from("app_secrets").upsert(
      [
        { key: "vapid_public", value: fresh.publicKey },
        { key: "vapid_private", value: fresh.privateKey },
      ],
      { onConflict: "key", ignoreDuplicates: true },
    );
    keys = await read();
  }
  if (!keys) throw new Error("Couldn't load the push keys.");
  cached = keys;
  return keys;
}

/** Sends any "photos are ready" notifications that are due. */
export async function sendDueGalleryPush(opts: { eventId?: string; limit?: number } = {}) {
  const db = admin();
  const { data: rows, error } = await db.rpc("claim_gallery_push", { p_event_id: opts.eventId ?? null, p_limit: opts.limit ?? 300 });
  if (error) throw new Error(`push claim failed: ${error.message}`);
  if (!rows?.length) return { claimed: 0, sent: 0, failed: 0 };

  const keys = await pushKeys();
  const contact = process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM?.match(/<(.+)>/)?.[1] || "support@lastshot.app";
  webpush.setVapidDetails(`mailto:${contact}`, keys.publicKey, keys.privateKey);

  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
      const payload = JSON.stringify({
        title: "Your photos are developed",
        body: `The roll from ${r.event_title} is ready. Tap to see every shot.`,
        url: `${siteUrl()}/e/${r.event_code}/gallery`,
        tag: `gallery-${r.event_id}`,
      });
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, {
          TTL: 60 * 60 * 24 * 3,
          urgency: "normal",
        });
        await db.from("guest_push").update({ sent_at: new Date().toISOString(), sending_started_at: null, last_error: null }).eq("id", r.id);
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        failed++;
        // 404 and 410 mean the phone unsubscribed or the browser dropped it: stop trying.
        await db
          .from("guest_push")
          .update({
            sending_started_at: null,
            last_error: `${status ?? ""} ${e instanceof Error ? e.message : "send failed"}`.trim().slice(0, 300),
            ...(status === 404 || status === 410 ? { attempts: 99 } : {}),
          })
          .eq("id", r.id);
      }
    }),
  );
  return { claimed: rows.length, sent, failed };
}
