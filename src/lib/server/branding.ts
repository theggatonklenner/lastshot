import "server-only";
import { randomUUID } from "node:crypto";
import { admin, MEDIA_BUCKET } from "@/lib/supabase/admin";

/** Copies the organiser's saved logo into an event's folder, if the event has none yet. */
export async function copyAccountLogo(userId: string, eventId: string) {
  const db = admin();
  const { data: profile } = await db.from("profiles").select("brand_logo_path").eq("id", userId).maybeSingle();
  if (!profile?.brand_logo_path) return;
  const to = `${eventId}/brand/${randomUUID()}.png`;
  const { error } = await db.storage.from(MEDIA_BUCKET).copy(profile.brand_logo_path, to);
  if (error) throw new Error(error.message);
  const { data } = await db.from("events").update({ brand_logo_path: to }).eq("id", eventId).is("brand_logo_path", null).select("id");
  if (!data?.length) await db.storage.from(MEDIA_BUCKET).remove([to]);
}
