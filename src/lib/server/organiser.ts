import "server-only";
import { redirect, notFound } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { admin } from "@/lib/supabase/admin";
import type { EventRecord } from "@/lib/database.types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** For pages: signed-in organiser or redirect to login. */
export async function requireOrganiser(next = "/dashboard") {
  const { supabase, user } = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return { supabase, user };
}

/**
 * Loads an event through RLS, so it only resolves for its owner and
 * co-organisers. Anyone else gets a plain 404, which avoids confirming the
 * event exists. `isOwner` marks the creator, who alone can delete the event
 * and manage the team.
 */
export async function requireOwnedEvent(id: string) {
  if (!UUID_RE.test(id)) notFound();
  const { supabase, user } = await requireOrganiser(`/dashboard/events/${id}`);
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();
  return { supabase, user, event: event as EventRecord, isOwner: event.owner_id === user.id };
}

/** Owner or co-organiser, checked with the service client (for guest pages). */
export async function isEventOrganiser(event: Pick<EventRecord, "id" | "owner_id">, userId: string | undefined | null) {
  if (!userId) return false;
  if (event.owner_id === userId) return true;
  const { data } = await admin()
    .from("event_members")
    .select("user_id")
    .eq("event_id", event.id)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** For API routes: returns null instead of redirecting. */
export async function ownedEventForApi(id: string) {
  if (!UUID_RE.test(id)) return null;
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data: event } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) return null;
  return { supabase, user, event: event as EventRecord };
}
