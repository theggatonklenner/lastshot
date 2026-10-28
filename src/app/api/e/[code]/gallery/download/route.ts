import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { clientIp, getEventByCode, hashIp, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { resolveGalleryViewer } from "@/lib/server/gallery";
import { signPaths } from "@/lib/server/media";

/** Signed links for every downloadable original, used to build ZIP files in the browser. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/e/[code]/gallery/download">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");
  if (!(await rateLimit(`zip:${hashIp(await clientIp())}`, 10, 600))) return guestError("rate_limited");

  const { isOwner, access } = await resolveGalleryViewer(event, code);
  if (!access.allowed) return jsonError(403, access.reason, "The gallery isn't open yet.");
  if (!isOwner && !event.guest_downloads_enabled) {
    return jsonError(403, "downloads_disabled", "The organiser has turned off downloads.");
  }

  const { data, error } = await admin()
    .from("photos")
    .select("id, storage_path, captured_at")
    .eq("event_id", event.id)
    .eq("upload_status", "complete")
    .eq("moderation_status", "approved")
    .order("captured_at", { ascending: true })
    .limit(5000);
  if (error) return guestError("server_error");

  const urls = await signPaths((data ?? []).map((p) => p.storage_path), 60 * 30);
  const files = (data ?? []).map((p, i) => ({
    name: `${String(i + 1).padStart(4, "0")}.jpg`,
    url: urls[i],
  }));
  return Response.json({ ok: true, title: event.title, files }, { headers: { "Cache-Control": "no-store" } });
}
