import "server-only";
import { isEventOrganiser } from "@/lib/server/organiser";
import { admin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { getGuestForEvent, hasViewPass } from "@/lib/server/guest";
import { signPaths, servedPath } from "@/lib/server/media";
import { galleryAccess, type GalleryAccess } from "@/lib/rules";
import type { EventRecord } from "@/lib/database.types";

export type GallerySort = "newest" | "oldest" | "shuffle";
export const PAGE_SIZE = 36;

export type GalleryPhoto = {
  id: string;
  thumbUrl: string;
  displayUrl: string;
  originalUrl: string | null;
  width: number;
  height: number;
  takenAt: string;
  guestName: string | null;
};

export async function resolveGalleryViewer(event: EventRecord, code: string) {
  const [{ user }, guest, pass] = await Promise.all([getUser(), getGuestForEvent(event, code), hasViewPass(event, code)]);
  // Organisers (owner or co-organiser) can always preview and see everything.
  const isOwner = await isEventOrganiser(event, user?.id);
  const isGuest = (!!guest && !guest.blocked) || pass;
  return { isOwner, isGuest, access: galleryAccess(event, { isOwner, isGuest }) as GalleryAccess };
}

/**
 * Approved, completed photos only. Callers must check access first; this
 * function is the only place gallery photos are read for guests.
 */
export async function loadGalleryPage(
  event: EventRecord,
  opts: { sort: GallerySort; offset: number; limit?: number; includeOriginals: boolean },
): Promise<{ photos: GalleryPhoto[]; nextOffset: number | null; total: number }> {
  const limit = opts.limit ?? PAGE_SIZE;
  let q = admin()
    .from("photos")
    .select("id, thumbnail_path, display_path, storage_path, width, height, captured_at, uploaded_at, guest_id, watermarked", {
      count: "exact",
    })
    .eq("event_id", event.id)
    .eq("upload_status", "complete")
    .eq("moderation_status", "approved");

  if (opts.sort === "shuffle") {
    // Photo ids are random v4 UUIDs, so ordering by id is a stable shuffle.
    q = q.order("id", { ascending: true });
  } else {
    q = q.order("uploaded_at", { ascending: opts.sort === "oldest" }).order("id", { ascending: true });
  }

  const { data, count, error } = await q.range(opts.offset, opts.offset + limit - 1);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  let names = new Map<string, string | null>();
  if (event.show_guest_names && rows.length > 0) {
    const guestIds = [...new Set(rows.map((r) => r.guest_id))];
    const { data: guests } = await admin().from("event_guests").select("id, display_name").in("id", guestIds);
    names = new Map((guests ?? []).map((g) => [g.id, g.display_name]));
  }

  const signed = await signPaths(
    rows.flatMap((r) => [
      r.thumbnail_path,
      servedPath(r.display_path, r, event),
      opts.includeOriginals ? servedPath(r.storage_path, r, event) : null,
    ]),
  );

  const photos: GalleryPhoto[] = rows.map((r, i) => ({
    id: r.id,
    thumbUrl: signed[i * 3] ?? "",
    displayUrl: signed[i * 3 + 1] ?? "",
    originalUrl: signed[i * 3 + 2],
    width: r.width ?? 3,
    height: r.height ?? 4,
    takenAt: r.captured_at ?? r.uploaded_at ?? new Date().toISOString(),
    guestName: event.show_guest_names ? (names.get(r.guest_id) ?? null) : null,
  }));

  const total = count ?? 0;
  const next = opts.offset + rows.length;
  return { photos, nextOffset: next < total ? next : null, total };
}
