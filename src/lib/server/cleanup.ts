import "server-only";
import { admin } from "@/lib/supabase/admin";
import { allPhotoFiles, removeObjects } from "@/lib/server/media";

/**
 * Permanently deletes events with every photo file, guest, email and report.
 * Database rows go first, so nothing can be signed or shown afterwards, then
 * the stored files.
 */
export async function deleteEventsCompletely(eventIds: string[]): Promise<{ events: number; files: number }> {
  if (!eventIds.length) return { events: 0, files: 0 };
  const db = admin();
  const [{ data: photos }, { data: events }] = await Promise.all([
    db.from("photos").select("storage_path, display_path, thumbnail_path").in("event_id", eventIds),
    db.from("events").select("cover_image_path").in("id", eventIds),
  ]);
  const files = [
    ...(events ?? []).map((e) => e.cover_image_path),
    ...(photos ?? []).flatMap(allPhotoFiles),
  ].filter((f): f is string => !!f);

  const { error } = await db.from("events").delete().in("id", eventIds);
  if (error) throw new Error(`event delete failed: ${error.message}`);
  try {
    await removeObjects(files);
  } catch (e) {
    console.error("orphaned files after event delete", e);
  }
  return { events: eventIds.length, files: files.length };
}

/** Deletes an organiser account: their own events (not co-organised ones) and the login. */
export async function deleteAccountCompletely(userId: string) {
  const db = admin();
  const { data: owned } = await db.from("events").select("id").eq("owner_id", userId);
  await deleteEventsCompletely((owned ?? []).map((e) => e.id));
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
