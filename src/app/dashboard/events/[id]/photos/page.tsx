import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { signPaths } from "@/lib/server/media";
import { PhotoManager, type ManagedPhoto } from "./photo-manager";

export const metadata: Metadata = { title: "Photos" };

export default async function PhotosPage({ params, searchParams }: PageProps<"/dashboard/events/[id]/photos">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, event } = await requireOwnedEvent(id);

  const [{ data: photos }, { data: guests }, { data: reports }] = await Promise.all([
    supabase
      .from("photos")
      .select("id, guest_id, thumbnail_path, display_path, uploaded_at, captured_at, moderation_status, flagged, source, width, height, file_size")
      .eq("event_id", id)
      .eq("upload_status", "complete")
      .order("uploaded_at", { ascending: false })
      .limit(2000),
    supabase.from("event_guests").select("id, display_name, created_at").eq("event_id", id).order("created_at"),
    supabase.from("photo_reports").select("photo_id, reason, details").eq("event_id", id).is("resolved_at", null),
  ]);
  const reportsByPhoto = new Map<string, { reason: string; details: string | null }[]>();
  for (const r of reports ?? []) {
    reportsByPhoto.set(r.photo_id, [...(reportsByPhoto.get(r.photo_id) ?? []), { reason: r.reason, details: r.details }]);
  }

  const rows = photos ?? [];
  const signed = await signPaths(rows.flatMap((p) => [p.thumbnail_path, p.display_path]));
  const guestLabel = new Map((guests ?? []).map((g, i) => [g.id, g.display_name || `Guest ${i + 1}`]));

  const managed: ManagedPhoto[] = rows.map((p, i) => ({
    id: p.id,
    guestId: p.guest_id,
    guestName: guestLabel.get(p.guest_id) ?? "Guest",
    thumbUrl: signed[i * 2] ?? "",
    displayUrl: signed[i * 2 + 1] ?? "",
    uploadedAt: p.uploaded_at ?? p.captured_at ?? new Date().toISOString(),
    status: p.moderation_status,
    flagged: p.flagged,
    source: p.source,
    reports: reportsByPhoto.get(p.id) ?? [],
  }));

  return (
    <PhotoManager
      eventId={id}
      title={event.title}
      timezone={event.timezone}
      photos={managed}
      guests={(guests ?? []).map((g) => ({ id: g.id, label: guestLabel.get(g.id)! }))}
      initialGuest={typeof sp.guest === "string" ? sp.guest : ""}
      initialFilter={sp.filter === "flagged" ? "flagged" : undefined}
      requireApproval={event.require_approval}
    />
  );
}
