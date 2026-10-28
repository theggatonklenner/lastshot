"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { hashToken, newGuestToken, rateLimit } from "@/lib/server/guest";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function ownerOf(eventId: string) {
  const { supabase, user } = await getUser();
  if (!user) throw new Error("Sign in again to continue.");
  z.uuid().parse(eventId);
  const { data: event } = await supabase.from("events").select("id, title, owner_id").eq("id", eventId).maybeSingle();
  if (!event) throw new Error("Event not found.");
  if (event.owner_id !== user.id) throw new Error("Only the person who created this event can manage the team.");
  return { user, event };
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
}

/**
 * Invites someone by email. They get a link that works for 14 days and only
 * for an account with that email address.
 */
export async function inviteCoOrganiser(
  eventId: string,
  emailRaw: string,
): Promise<Result<{ emailed: boolean; link: string }>> {
  try {
    const { user, event } = await ownerOf(eventId);
    const email = emailRaw.trim().toLowerCase();
    if (!z.email().safeParse(email).success) throw new Error("Enter a valid email address.");
    if (email === user.email?.toLowerCase()) throw new Error("That's your own email.");
    if (!(await rateLimit(`invite:${user.id}`, 30, 3600))) throw new Error("Too many invites. Try again in an hour.");

    const db = admin();
    const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
    if (existing) {
      const { data: member } = await db
        .from("event_members")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("user_id", existing.id)
        .maybeSingle();
      if (member) throw new Error("They're already a co-organiser.");
    }

    const token = newGuestToken();
    const { error } = await db.from("event_invites").upsert(
      {
        event_id: eventId,
        email,
        token_hash: hashToken(token),
        invited_by: user.id,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        accepted_at: null,
        accepted_by: null,
      },
      { onConflict: "event_id,email" },
    );
    if (error) throw new Error("The invite wasn't saved. Try again.");

    const link = `${siteUrl()}/invite/${token}`;
    let emailed = false;
    if (emailConfigured()) {
      const { data: me } = await db.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const who = me?.display_name || user.email;
      const mail = organiserNoticeEmail({
        heading: `${who} invited you to help run ${event.title}`,
        lines: [
          "As a co-organiser you can see and moderate every photo, manage guests and change the event's settings on Lastshot.",
          `Accept with an account for ${email}. The link works for 14 days.`,
        ],
        buttonLabel: "Accept the invite",
        buttonUrl: link,
      });
      const res = await sendBatch([{ to: email, subject: mail.subject, html: mail.html, text: mail.text }]);
      emailed = res.ok;
    }
    revalidatePath(`/dashboard/events/${eventId}/settings`);
    return { ok: true, data: { emailed, link } };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelInvite(eventId: string, inviteId: string): Promise<Result> {
  try {
    await ownerOf(eventId);
    await admin().from("event_invites").delete().eq("id", z.uuid().parse(inviteId)).eq("event_id", eventId);
    revalidatePath(`/dashboard/events/${eventId}/settings`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removeCoOrganiser(eventId: string, userId: string): Promise<Result> {
  try {
    await ownerOf(eventId);
    await admin().from("event_members").delete().eq("event_id", eventId).eq("user_id", z.uuid().parse(userId));
    revalidatePath(`/dashboard/events/${eventId}/settings`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function leaveEvent(eventId: string): Promise<Result> {
  try {
    const { supabase, user } = await getUser();
    if (!user) throw new Error("Sign in again to continue.");
    const { error } = await supabase.from("event_members").delete().eq("event_id", z.uuid().parse(eventId)).eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?left=1");
}

/** Accepts an invite for the signed-in account. */
export async function acceptInvite(token: string): Promise<Result> {
  let eventId: string;
  try {
    const { user } = await getUser();
    if (!user) throw new Error("Sign in first.");
    const { data, error } = await admin().rpc("accept_event_invite", { p_token_hash: hashToken(token), p_user_id: user.id });
    if (error) {
      const msg = error.message;
      if (msg.includes("invite_wrong_account")) throw new Error("This invite was sent to a different email address.");
      if (msg.includes("invite_expired")) throw new Error("This invite has expired. Ask for a new one.");
      if (msg.includes("invite_used")) throw new Error("This invite has already been used.");
      throw new Error("This invite isn't valid.");
    }
    eventId = data as string;
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/dashboard");
  redirect(`/dashboard/events/${eventId}?joined=1`);
}
