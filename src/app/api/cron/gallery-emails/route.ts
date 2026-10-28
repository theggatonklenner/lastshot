import type { NextRequest } from "next/server";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";
import { rateLimit } from "@/lib/server/guest";
import { cronAuthorised } from "@/lib/server/cron-auth";

export const maxDuration = 60;

/**
 * Sends any "photos are ready" emails that are due (mainly scheduled reveals).
 * Called every few minutes by Supabase pg_cron, and also works with Vercel Cron,
 * which sends `Authorization: Bearer $CRON_SECRET` automatically.
 */
async function run(req: NextRequest) {
  if (!cronAuthorised(req)) return Response.json({ ok: false }, { status: 401 });
  if (!(await rateLimit("cron:gallery-emails", 20, 60))) return Response.json({ ok: false }, { status: 429 });
  const summary = await sendDueGalleryEmails({ limit: 200 });
  return Response.json({ ok: true, ...summary });
}

export const GET = run;
export const POST = run;
