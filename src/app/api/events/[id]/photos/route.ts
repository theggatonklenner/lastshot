import type { NextRequest } from "next/server";
import { z } from "zod";
import { ownedEventForApi } from "@/lib/server/organiser";
import { jsonError } from "@/lib/server/http";
import { removeObjects, signPaths } from "@/lib/server/media";

const Ids = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

/** Signed links to originals for the organiser's downloads. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[id]/photos">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  const parsed = Ids.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Select at least one photo.");

  // RLS limits this to the organiser's own photos.
  const { data } = await owned.supabase
    .from("photos")
    .select("id, storage_path, captured_at")
    .eq("event_id", owned.event.id)
    .eq("upload_status", "complete")
    .in("id", parsed.data.ids)
    .order("captured_at", { ascending: true });
  const urls = await signPaths((data ?? []).map((p) => p.storage_path), 60 * 30);
  return Response.json({
    ok: true,
    title: owned.event.title,
    files: (data ?? []).map((p, i) => ({ id: p.id, name: `${String(i + 1).padStart(4, "0")}.jpg`, url: urls[i] })),
  });
}

/** Permanently deletes photos and their files. Shots are not refunded. */
export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/events/[id]/photos">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  const parsed = Ids.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Select at least one photo.");

  const { data: photos } = await owned.supabase
    .from("photos")
    .select("id, storage_path, display_path, thumbnail_path")
    .eq("event_id", owned.event.id)
    .in("id", parsed.data.ids);
  if (!photos?.length) return Response.json({ ok: true, deleted: 0 });

  // Remove the database rows first so nothing can be signed afterwards, then files.
  const { error } = await owned.supabase
    .from("photos")
    .delete()
    .in(
      "id",
      photos.map((p) => p.id),
    );
  if (error) return jsonError(500, "server_error", "Those photos weren't deleted. Try again.");
  try {
    await removeObjects(photos.flatMap((p) => [p.storage_path, p.display_path, p.thumbnail_path]));
  } catch (e) {
    console.error("orphaned files after delete", e);
  }
  return Response.json({ ok: true, deleted: photos.length });
}
