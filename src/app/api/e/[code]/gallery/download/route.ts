import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { clientIp, getEventByCode, getGuestForEvent, hashIp, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { resolveGalleryViewer } from "@/lib/server/gallery";
import { servedPath, signPaths } from "@/lib/server/media";

/** Signed links for every downloadable original, used to build ZIP files in the browser. */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/e/[code]/gallery/download">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");
  if (!(await rateLimit(`zip:${hashIp(await clientIp())}`, 10, 600))) return guestError("rate_limited");

  const { isOwner, access } = await resolveGalleryViewer(event, code);
  if (!access.allowed) return jsonError(403, access.reason, "The gallery isn't open yet.");
  if (!isOwner && !event.guest_downloads_enabled) {
    return jsonError(403, "downloads_disabled", "The organiser has turned off downloads.");
  }

  let mineId: string | null = null;
  if (req.nextUrl.searchParams.get("mine") === "1") {
    const guest = await getGuestForEvent(event, code);
    if (!guest) return Response.json({ ok: true, title: event.title, files: [] });
    mineId = guest.id;
  }

  let q = admin()
    .from("photos")
    .select("id, storage_path, captured_at, watermarked")
    .eq("event_id", event.id)
    .eq("upload_status", "complete")
    .eq("moderation_status", "approved")
    .order("captured_at", { ascending: true })
    .limit(5000);
  if (mineId) q = q.eq("guest_id", mineId);
  const { data, error } = await q;
  if (error) return guestError("server_error");

  const urls = await signPaths((data ?? []).map((p) => servedPath(p.storage_path, p, event)), 60 * 30);
  const files = (data ?? []).map((p, i) => ({
    name: `${String(i + 1).padStart(4, "0")}.jpg`,
    url: urls[i],
  }));
  return Response.json({ ok: true, title: event.title, files }, { headers: { "Cache-Control": "no-store" } });
}
