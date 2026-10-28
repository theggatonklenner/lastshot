import type { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";
import { rateLimit } from "@/lib/server/guest";

export const maxDuration = 60;

/**
 * With CRON_SECRET set, callers must send it. Without it the endpoint is open,
 * which is safe: it only sends emails that are already due, each exactly once,
 * and is rate limited below.
 */
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Sends any "photos are ready" emails that are due (mainly scheduled reveals).
 * Called every few minutes by Supabase pg_cron, and also works with Vercel Cron,
 * which sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
async function run(req: NextRequest) {
  if (!authorised(req)) return Response.json({ ok: false }, { status: 401 });
  if (!(await rateLimit("cron:gallery-emails", 20, 60))) return Response.json({ ok: false }, { status: 429 });
  const summary = await sendDueGalleryEmails({ limit: 200 });
  return Response.json({ ok: true, ...summary });
}

export const GET = run;
export const POST = run;
