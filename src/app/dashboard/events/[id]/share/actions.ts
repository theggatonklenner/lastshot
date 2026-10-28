"use server";

import { revalidatePath } from "next/cache";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { admin } from "@/lib/supabase/admin";
import { normaliseSlug, slugProblem } from "@/lib/plans";

export type SlugResult = { ok: true; slug: string | null } | { ok: false; error: string };

/** Sets or clears the event's lastshot.app/<slug> link (Custom link add-on). */
export async function setCustomSlug(eventId: string, input: string): Promise<SlugResult> {
  const { event } = await requireOwnedEvent(eventId);
  if (!event.addon_link) return { ok: false, error: "Add the Custom link add-on first." };
  const slug = input.trim() ? normaliseSlug(input) : null;
  if (slug) {
    const problem = slugProblem(slug);
    if (problem) return { ok: false, error: problem };
  }
  const { error } = await admin().from("events").update({ custom_slug: slug }).eq("id", event.id);
  if (error) {
    if (error.code === "23505" || error.message.includes("slug_taken")) return { ok: false, error: "That link is taken. Try another." };
    return { ok: false, error: "Couldn't save the link. Try again." };
  }
  revalidatePath(`/dashboard/events/${event.id}`, "layout");
  return { ok: true, slug };
}
