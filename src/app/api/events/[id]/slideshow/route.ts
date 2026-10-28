import type { NextRequest } from "next/server";
import { ownedEventForApi } from "@/lib/server/organiser";
import { jsonError } from "@/lib/server/http";
import { servedPath, signPaths } from "@/lib/server/media";
import { galleryRevealed } from "@/lib/rules";

export const dynamic = "force-dynamic";

/**
 * Photos for the TV slideshow: approved, finished uploads, newest first, with
 * display-size links that last two hours. Organisers only (RLS).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/events/[id]/slideshow">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");

  const { data, error } = await owned.supabase
    .from("photos")
    .select("id, display_path, uploaded_at, watermarked")
    .eq("event_id", owned.event.id)
    .eq("upload_status", "complete")
    .eq("moderation_status", "approved")
    .order("uploaded_at", { ascending: false })
    .limit(400);
  if (error) return jsonError(500, "server_error", "Couldn't load photos.");

  const rows = (data ?? []).filter((p) => p.display_path);
  const urls = await signPaths(
    rows.map((p) => servedPath(p.display_path, p, owned.event)),
    60 * 60 * 2,
  );
  return Response.json(
    {
      ok: true,
      status: owned.event.status,
      // For the countdown reveal: hold photos on the TV until the gallery opens.
      revealed: galleryRevealed(owned.event),
      revealMode: owned.event.reveal_mode,
      revealAt: owned.event.reveal_mode === "scheduled" ? owned.event.reveal_at : null,
      photos: rows
        .map((p, i) => ({ id: p.id, url: urls[i], at: p.uploaded_at }))
        .filter((p): p is { id: string; url: string; at: string | null } => !!p.url),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
