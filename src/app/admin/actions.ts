"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/server/admin-auth";
import { removeObjects } from "@/lib/server/media";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

const uuid = z.uuid();

async function deleteEventFiles(eventIds: string[]) {
  if (!eventIds.length) return;
  const db = admin();
  const { data: photos } = await db
    .from("photos")
    .select("storage_path, display_path, thumbnail_path")
    .in("event_id", eventIds);
  const { data: events } = await db.from("events").select("cover_image_path").in("id", eventIds);
  return [
    ...(events ?? []).map((e) => e.cover_image_path),
    ...(photos ?? []).flatMap((p) => [p.storage_path, p.display_path, p.thumbnail_path]),
  ];
}

export async function suspendEvent(eventId: string, reason: string): Promise<Result> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const { error } = await admin()
      .from("events")
      .update({ suspended_at: new Date().toISOString(), suspended_reason: reason.trim().slice(0, 300) || null })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function unsuspendEvent(eventId: string): Promise<Result> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const { error } = await admin().from("events").update({ suspended_at: null, suspended_reason: null }).eq("id", eventId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function adminDeleteEvent(eventId: string, confirmCode: string): Promise<Result> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const { data: event } = await admin().from("events").select("code").eq("id", eventId).maybeSingle();
    if (!event) throw new Error("Event not found.");
    if (confirmCode.trim() !== event.code) throw new Error("Type the event code exactly to confirm.");
    const files = await deleteEventFiles([eventId]);
    const { error } = await admin().from("events").delete().eq("id", eventId);
    if (error) throw new Error(error.message);
    await removeObjects(files ?? []).catch((e) => console.error("orphaned files", e));
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/events?deleted=1");
}

export async function adminDeletePhotos(eventId: string, ids: string[]): Promise<Result<{ deleted: number }>> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const valid = z.array(uuid).min(1).max(500).parse(ids);
    const db = admin();
    const { data: photos } = await db
      .from("photos")
      .select("id, storage_path, display_path, thumbnail_path")
      .eq("event_id", eventId)
      .in("id", valid);
    if (!photos?.length) return { ok: true, data: { deleted: 0 } };
    const { error } = await db.from("photos").delete().in("id", photos.map((p) => p.id));
    if (error) throw new Error(error.message);
    await removeObjects(photos.flatMap((p) => [p.storage_path, p.display_path, p.thumbnail_path])).catch(() => {});
    revalidatePath(`/admin/events/${eventId}`);
    return { ok: true, data: { deleted: photos.length } };
  } catch (e) {
    return fail(e);
  }
}

export async function setAdminFlag(userId: string, isAdmin: boolean): Promise<Result> {
  try {
    const { user } = await assertAdmin();
    uuid.parse(userId);
    if (userId === user.id) throw new Error("You can't change your own admin access.");
    const { error } = await admin().from("profiles").update({ is_admin: isAdmin }).eq("id", userId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/organisers");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Deletes an organiser's account, every event they own, and all of its photos. */
export async function deleteOrganiser(userId: string, confirmEmail: string): Promise<Result> {
  try {
    const { user } = await assertAdmin();
    uuid.parse(userId);
    if (userId === user.id) throw new Error("You can't delete your own account here.");
    const db = admin();
    const { data: profile } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Organiser not found.");
    if (confirmEmail.trim().toLowerCase() !== profile.email.toLowerCase()) {
      throw new Error("Type the organiser's email exactly to confirm.");
    }
    const { data: events } = await db.from("events").select("id").eq("owner_id", userId);
    const ids = (events ?? []).map((e) => e.id);
    const files = await deleteEventFiles(ids);
    if (ids.length) {
      const { error } = await db.from("events").delete().in("id", ids);
      if (error) throw new Error(error.message);
    }
    const { error: authError } = await db.auth.admin.deleteUser(userId);
    if (authError) throw new Error(authError.message);
    await removeObjects(files ?? []).catch((e) => console.error("orphaned files", e));
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function retryFailedEmails(): Promise<Result<{ sent: number; failed: number }>> {
  try {
    await assertAdmin();
    await admin()
      .from("guest_emails")
      .update({ attempts: 0, last_error: null, sending_started_at: null })
      .is("sent_at", null)
      .is("unsubscribed_at", null)
      .gte("attempts", 5);
    const summary = await sendDueGalleryEmails({ limit: 200 });
    revalidatePath("/admin/emails");
    return { ok: true, data: { sent: summary.sent, failed: summary.failed } };
  } catch (e) {
    return fail(e);
  }
}

export async function runEmailSender(): Promise<Result<{ sent: number; failed: number; skipped?: string }>> {
  try {
    await assertAdmin();
    const summary = await sendDueGalleryEmails({ limit: 200 });
    revalidatePath("/admin/emails");
    return { ok: true, data: { sent: summary.sent, failed: summary.failed, skipped: summary.skipped } };
  } catch (e) {
    return fail(e);
  }
}
