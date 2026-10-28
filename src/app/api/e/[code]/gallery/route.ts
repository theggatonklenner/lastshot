import type { NextRequest } from "next/server";
import { getEventByCode, rateLimit, hashIp, clientIp } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { loadGalleryPage, resolveGalleryViewer, type GallerySort } from "@/lib/server/gallery";

const SORTS: GallerySort[] = ["newest", "oldest", "shuffle"];

export async function GET(req: NextRequest, ctx: RouteContext<"/api/e/[code]/gallery">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");

  if (!(await rateLimit(`gallery:${hashIp(await clientIp())}`, 240, 60))) return guestError("rate_limited");

  const { isOwner, access } = await resolveGalleryViewer(event, code);
  if (!access.allowed) {
    // Hidden photos are never listed or signed before the reveal.
    return jsonError(403, access.reason, "The gallery isn't open yet.", { revealAt: access.revealAt ?? null });
  }

  const params = req.nextUrl.searchParams;
  const sortParam = params.get("sort") as GallerySort | null;
  const sort = sortParam && SORTS.includes(sortParam) ? sortParam : "newest";
  const offset = Math.max(0, Math.min(100_000, Number(params.get("offset") ?? 0) || 0));

  const page = await loadGalleryPage(event, {
    sort,
    offset,
    includeOriginals: isOwner || event.guest_downloads_enabled,
  });
  return Response.json({ ok: true, ...page }, { headers: { "Cache-Control": "no-store" } });
}
