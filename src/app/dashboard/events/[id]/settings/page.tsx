import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { signOne } from "@/lib/server/media";
import { STATUS_LABEL, galleryRevealed, isPast, retentionUntil } from "@/lib/rules";
import { Panel } from "@/components/ui";
import { LifecycleActions } from "../lifecycle";
import { KeepPhotos } from "../keep-photos";
import { SettingsForm } from "./settings-form";
import { TeamPanel, type TeamInvite, type TeamPerson } from "./team";
import { admin } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/dashboard/events/[id]/settings">) {
  const { id } = await params;
  const { event, isOwner } = await requireOwnedEvent(id);
  // The viewer is an organiser of this event (checked above), so read the team with the service client
  // (profiles are otherwise private to each user).
  const db = admin();
  const [coverUrl, { data: members }, { data: invites }] = await Promise.all([
    signOne(event.cover_image_path),
    db.from("event_members").select("user_id").eq("event_id", id),
    db.from("event_invites").select("id, email, expires_at").eq("event_id", id).is("accepted_at", null),
  ]);
  const ids = [event.owner_id, ...(members ?? []).map((m) => m.user_id)];
  const { data: profiles } = await db.from("profiles").select("id, email, display_name").in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const people: TeamPerson[] = ids
    .filter((uid) => byId.has(uid))
    .map((uid) => ({
      id: uid,
      name: byId.get(uid)!.display_name,
      email: byId.get(uid)!.email,
      role: uid === event.owner_id ? "owner" : "co",
    }));
  const pendingInvites: TeamInvite[] = (invites ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    expired: isPast(i.expires_at),
  }));
  return (
    <div className="flex flex-col gap-6">
      <Panel className="max-w-3xl">
        <h2 className="mb-1 text-xl font-bold">Event status</h2>
        <p className="mb-4 text-graphite">
          Currently: {STATUS_LABEL[event.status]}
          {event.submissions_closed_at && event.status !== "ended" ? ", new photos paused" : ""}.
        </p>
        <LifecycleActions event={event} revealed={galleryRevealed(event)} />
        <div className="mt-4 border-t border-line pt-2">
          <KeepPhotos
            eventId={event.id}
            keep={event.keep_photos}
            deleteAfter={retentionUntil(event)?.toISOString() ?? null}
            ended={event.status === "ended" || event.status === "archived"}
          />
        </div>
      </Panel>
      <TeamPanel eventId={event.id} isOwner={isOwner} people={people} invites={pendingInvites} />
      <SettingsForm event={event} coverUrl={coverUrl} isOwner={isOwner} />
    </div>
  );
}
