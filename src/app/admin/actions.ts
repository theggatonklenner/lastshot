"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/server/admin-auth";
import { removeObjects, allPhotoFiles } from "@/lib/server/media";
import { deleteAccountCompletely, deleteEventsCompletely } from "@/lib/server/cleanup";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";
import { emailConfigured, galleryReadyEmail, sendBatch } from "@/lib/server/email";
import { siteUrl } from "@/lib/env";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

const uuid = z.uuid();

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
    await deleteEventsCompletely([eventId]);
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
    await removeObjects(photos.flatMap(allPhotoFiles)).catch(() => {});
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
    await deleteAccountCompletely(userId);
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

/** Sends a sample "photos are ready" email to the signed-in admin. */
export async function sendTestEmail(): Promise<Result<{ to: string }>> {
  try {
    const { user } = await assertAdmin();
    if (!user.email) throw new Error("Your account has no email address.");
    if (!emailConfigured()) throw new Error("Add RESEND_API_KEY and EMAIL_FROM in Vercel, then redeploy.");
    const base = siteUrl();
    const mail = galleryReadyEmail({
      eventTitle: "Lastshot test event",
      galleryUrl: `${base}/try`,
      unsubscribeUrl: `${base}/privacy`,
      photoCount: 27,
    });
    const res = await sendBatch(
      [{ to: user.email, subject: `[Test] ${mail.subject}`, html: mail.html, text: mail.text }],
      `test:${user.id}:${Date.now()}`,
    );
    if (!res.ok) throw new Error(res.error);
    return { ok: true, data: { to: user.email } };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveError(id: string): Promise<Result> {
  try {
    await assertAdmin();
    await admin().from("app_errors").update({ resolved_at: new Date().toISOString() }).eq("id", z.uuid().parse(id));
    revalidatePath("/admin/errors");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const PlanSchema = z.enum(["free", "small", "party", "big", "unlimited"]);

/** Sets an event's plan and extra seats directly (comps, refunds, support). */
export async function setEventPlan(eventId: string, plan: string, extraGuests: number): Promise<Result> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const p = PlanSchema.parse(plan);
    const extra = z.number().int().min(0).max(100000).parse(extraGuests);
    const { error } = await admin()
      .from("events")
      .update({ plan: p, extra_guests: extra, full_notified_at: null })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const AddonFlags = z.object({ frame: z.boolean(), branding: z.boolean(), storage: z.boolean(), storage1y: z.boolean(), sms: z.boolean() });

/** Turns add-ons on or off for an event without payment. */
export async function setEventAddons(eventId: string, flags: unknown): Promise<Result> {
  try {
    await assertAdmin();
    uuid.parse(eventId);
    const f = AddonFlags.parse(flags);
    const { error } = await admin()
      .from("events")
      .update({ addon_frame: f.frame, addon_branding: f.branding, addon_storage: f.storage, addon_storage_1y: f.storage1y, addon_sms: f.sms })
      .eq("id", eventId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
