"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";
import { emailConfigured } from "@/lib/server/email";
import { readyForEmail } from "@/lib/rules";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { EventInput, firstIssue } from "@/lib/event-schema";
import { deleteEventsCompletely } from "@/lib/server/cleanup";
import type { EventRecord } from "@/lib/database.types";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function organiser() {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Sign in again to continue.");
  return { supabase, user };
}

async function ownedEvent(id: string) {
  const { supabase, user } = await organiser();
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) throw new Error("Event not found.");
  const { data } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!data) throw new Error("Event not found.");
  return { supabase, user, event: data as EventRecord };
}

function fail(e: unknown): { ok: false; error: string } {
  const msg = e instanceof Error ? e.message : "Something went wrong.";
  if (msg.includes("scheduled reveal needs a reveal time")) return { ok: false, error: "Pick when the gallery opens." };
  if (msg.includes("cannot unpublish")) return { ok: false, error: "Guests have already joined, so it can't go back to draft." };
  if (msg.includes("invalid status change")) return { ok: false, error: "That change isn't possible from the event's current state." };
  return { ok: false, error: msg };
}

/** After anything that might open the gallery, send any emails that are now due. */
function sendEmailsLater(eventId: string) {
  after(() =>
    sendDueGalleryEmails({ eventId }).catch((e) => console.error("gallery email send failed", e)),
  );
}

function refresh(id?: string) {
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/dashboard/events/${id}`, "layout");
}

export async function createEvent(input: unknown, accessCode?: string | null): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = EventInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { supabase, user } = await organiser();
    const { data, error } = await supabase
      .from("events")
      .insert({ ...parsed.data, owner_id: user.id })
      .select("id")
      .single();
    if (error || !data) throw new Error("The event wasn't saved. Try again.");
    if (accessCode) {
      const { error: codeError } = await supabase.rpc("set_event_access_code", { p_event_id: data.id, p_code: accessCode });
      if (codeError) throw new Error(codeError.message);
    }
    refresh();
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    return fail(e);
  }
}

export async function updateEvent(id: string, input: unknown): Promise<ActionResult> {
  try {
    const parsed = EventInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { supabase } = await ownedEvent(id);
    const { error } = await supabase.from("events").update(parsed.data).eq("id", id);
    if (error) throw new Error(error.message);
    sendEmailsLater(id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setAccessCode(id: string, code: string | null): Promise<ActionResult> {
  try {
    const { supabase } = await ownedEvent(id);
    const { error } = await supabase.rpc("set_event_access_code", { p_event_id: id, p_code: code ?? "" });
    if (error) throw new Error(error.message);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type Lifecycle = "publish" | "unpublish" | "end" | "reopen" | "archive" | "unarchive" | "close" | "open" | "reveal" | "unreveal";

export async function changeLifecycle(id: string, action: Lifecycle): Promise<ActionResult> {
  try {
    const { supabase, event } = await ownedEvent(id);
    let patch: Partial<EventRecord>;
    switch (action) {
      case "publish":
        patch = { status: "published" };
        break;
      case "unpublish":
        patch = { status: "draft" };
        break;
      case "end":
        patch = { status: "ended" };
        break;
      case "reopen":
        patch = { status: "active", submissions_closed_at: null };
        break;
      case "archive":
        patch = { status: "archived" };
        break;
      case "unarchive":
        patch = { status: "ended" };
        break;
      case "close":
        patch = { submissions_closed_at: new Date().toISOString() };
        break;
      case "open":
        patch = { submissions_closed_at: null };
        break;
      case "reveal":
        patch = event.reveal_mode === "manual" ? { revealed_at: new Date().toISOString() } : { reveal_mode: "manual", revealed_at: new Date().toISOString() };
        break;
      case "unreveal":
        patch = { reveal_mode: "manual", revealed_at: null };
        break;
    }
    const { error } = await supabase.from("events").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    sendEmailsLater(id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setGuestBlocked(eventId: string, guestId: string, blocked: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await ownedEvent(eventId);
    const { error } = await supabase.from("event_guests").update({ blocked }).eq("id", guestId).eq("event_id", eventId);
    if (error) throw new Error(error.message);
    refresh(eventId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moderatePhotos(
  eventId: string,
  ids: string[],
  change: { moderation_status?: "approved" | "rejected" | "pending"; flagged?: boolean },
): Promise<ActionResult> {
  try {
    const valid = z.array(z.uuid()).min(1).max(500).safeParse(ids);
    if (!valid.success) return { ok: false, error: "Select at least one photo." };
    const { supabase } = await ownedEvent(eventId);
    const patch: { moderation_status?: "approved" | "rejected" | "pending"; flagged?: boolean; flag_reason?: string | null } = {
      ...change,
    };
    if (change.flagged === false) patch.flag_reason = null;
    const { error } = await supabase.from("photos").update(patch).eq("event_id", eventId).in("id", valid.data);
    if (error) throw new Error(error.message);
    if (change.flagged === false || change.moderation_status === "approved") {
      // The organiser has looked at these; close their open reports.
      await supabase
        .from("photo_reports")
        .update({ resolved_at: new Date().toISOString() })
        .eq("event_id", eventId)
        .in("photo_id", valid.data)
        .is("resolved_at", null);
      if (change.moderation_status === "approved") {
        await supabase.from("photos").update({ flagged: false, flag_reason: null }).eq("event_id", eventId).in("id", valid.data);
      }
    }
    refresh(eventId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEvent(id: string, confirmTitle: string): Promise<ActionResult> {
  try {
    const { user, event } = await ownedEvent(id);
    if (event.owner_id !== user.id) {
      return { ok: false, error: "Only the person who created this event can delete it." };
    }
    if (confirmTitle.trim() !== event.title.trim()) {
      return { ok: false, error: "Type the event name exactly to confirm." };
    }
    await deleteEventsCompletely([id]);
  } catch (e) {
    return fail(e);
  }
  refresh();
  redirect("/dashboard?deleted=1");
}

export async function updateProfile(displayName: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await organiser();
    const name = displayName.trim().slice(0, 80) || null;
    const { error } = await supabase.from("profiles").update({ display_name: name }).eq("id", user.id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Organiser presses "Send now". Only sends to people who haven't had it yet. */
export async function sendGalleryEmailsNow(eventId: string): Promise<ActionResult<{ sent: number; failed: number }>> {
  try {
    const { event } = await ownedEvent(eventId);
    if (!emailConfigured()) return { ok: false, error: "Email sending isn't set up yet. Add the Resend settings in Vercel." };
    if (!readyForEmail(event)) {
      return { ok: false, error: "The gallery isn't ready yet. End the event or reveal the gallery first." };
    }
    const summary = await sendDueGalleryEmails({ eventId });
    refresh(eventId);
    return { ok: true, data: { sent: summary.sent, failed: summary.failed } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeGuestEmail(eventId: string, emailId: string): Promise<ActionResult> {
  try {
    const { supabase } = await ownedEvent(eventId);
    const { error } = await supabase.from("guest_emails").delete().eq("id", emailId).eq("event_id", eventId);
    if (error) throw new Error(error.message);
    refresh(eventId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setKeepPhotos(eventId: string, keep: boolean): Promise<ActionResult> {
  try {
    const { supabase } = await ownedEvent(eventId);
    const { error } = await supabase.from("events").update({ keep_photos: keep }).eq("id", eventId);
    if (error) throw new Error(error.message);
    refresh(eventId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
