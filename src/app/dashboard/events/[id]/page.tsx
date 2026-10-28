import Link from "next/link";
import QRCode from "qrcode";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { signPaths } from "@/lib/server/media";
import { guestUrl } from "@/lib/env";
import { bonusPending, galleryRevealed, retentionUntil, shotLimit } from "@/lib/rules";
import { eventGuestLimit } from "@/lib/plans";
import { formatDateTime, timeAgo } from "@/lib/format";
import { Countdown } from "@/components/countdown";
import { CopyButton } from "@/components/copy-button";
import { EmptyState, LinkButton, Notice, Panel } from "@/components/ui";
import { LifecycleActions } from "./lifecycle";
import { KeepPhotos } from "./keep-photos";

export default async function EventOverview({ params, searchParams }: PageProps<"/dashboard/events/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, event } = await requireOwnedEvent(id);

  const [{ data: statsRows }, { data: guests }, { data: recent }] = await Promise.all([
    supabase.rpc("event_stats", { p_event_ids: [id] }),
    supabase.from("event_guests").select("photos_submitted").eq("event_id", id),
    supabase
      .from("photos")
      .select("id, thumbnail_path, uploaded_at, moderation_status")
      .eq("event_id", id)
      .eq("upload_status", "complete")
      .order("uploaded_at", { ascending: false })
      .limit(8),
  ]);
  const stats = statsRows?.[0] ?? { guests: 0, photos: 0, pending_review: 0, rejected: 0, flagged: 0 };
  const shotsUsed = (guests ?? []).reduce((n, g) => n + Math.min(g.photos_submitted, shotLimit(event)), 0);
  const shotsAvailable = (guests?.length ?? 0) * shotLimit(event);
  const reviewed = stats.photos ? Math.round(((stats.photos - stats.pending_review) / stats.photos) * 100) : 100;
  const thumbs = await signPaths((recent ?? []).map((p) => p.thumbnail_path));

  const url = guestUrl(event.code);
  const qr = event.status !== "draft" ? await QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#16171a", light: "#ffffff" } }) : null;
  const revealed = galleryRevealed(event);
  const guestLimit = eventGuestLimit(event);
  const nearlyFull = guestLimit !== null && stats.guests >= Math.floor(guestLimit * 0.8);
  const bonusLater = bonusPending(event);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-6">
        {sp.joined && <Notice tone="success">You&apos;re now a co-organiser of this event.</Notice>}
        {event.status === "draft" && (
          <Notice tone="info">
            This event is a draft. Guests can&apos;t join until you publish it.
          </Notice>
        )}
        {event.submissions_closed_at && (event.status === "published" || event.status === "active") && (
          <Notice tone="warn">New photos are paused. Guests can still view the gallery if it&apos;s open.</Notice>
        )}

        {nearlyFull && (
          <Notice
            tone={stats.guests >= guestLimit! ? "error" : "warn"}
            action={
              <Link href={`/dashboard/events/${id}/upgrade`} className="font-semibold underline">
                Upgrade
              </Link>
            }
          >
            {stats.guests >= guestLimit!
              ? `This event is full: all ${guestLimit} cameras are taken, so new guests can't join.`
              : `${stats.guests} of ${guestLimit} cameras are taken. Upgrade so nobody gets turned away.`}
          </Notice>
        )}
        {bonusLater && event.bonus_at && (
          <Notice tone="info">
            {event.bonus_shots} bonus {event.bonus_shots === 1 ? "shot unlocks" : "shots unlock"} for every guest at{" "}
            {formatDateTime(event.bonus_at)}.
          </Notice>
        )}

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
          <Stat label="Guests joined" value={guestLimit === null ? stats.guests : `${stats.guests}/${guestLimit}`} />
          <Stat label="Photos" value={stats.photos} />
          <Stat label="Reviewed" value={`${reviewed}%`} />
          <Stat label="Shots used" value={shotsAvailable ? `${shotsUsed}/${shotsAvailable}` : "0"} />
        </dl>

        <Panel>
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-bold">Event controls</h2>
            <GalleryState event={event} revealed={revealed} />
            <LifecycleActions event={event} revealed={revealed} />
            {(event.status === "ended" || event.status === "archived") && (
              <div className="border-t border-line pt-2">
                <KeepPhotos
                  eventId={event.id}
                  keep={event.keep_photos}
                  deleteAfter={retentionUntil(event)?.toISOString() ?? null}
                  ended
                  extended={event.addon_storage}
            oneYear={event.addon_storage_1y}
                />
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Latest photos</h2>
            {stats.photos > 0 && (
              <Link href={`/dashboard/events/${id}/photos`} className="font-semibold text-cobalt hover:underline">
                Manage photos
              </Link>
            )}
          </div>
          {recent?.length ? (
            <ul className="grid grid-cols-4 gap-2">
              {recent.map((p, i) => (
                <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-paper-2">
                  {thumbs[i] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[i]!} alt="" className="size-full object-cover" loading="lazy" />
                  )}
                  {p.moderation_status === "pending" && (
                    <span className="absolute bottom-1 left-1 rounded bg-cobalt px-1.5 text-xs font-semibold text-white">
                      To review
                    </span>
                  )}
                  <span className="sr-only">Uploaded {timeAgo(p.uploaded_at ?? new Date().toISOString())}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No photos yet">
              {event.status === "draft"
                ? "Publish the event and share the QR code to start collecting photos."
                : "Photos appear here the moment guests take them."}
            </EmptyState>
          )}
        </Panel>
      </div>

      <aside className="flex flex-col gap-6">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Guest link</h2>
          {qr ? (
            <div className="flex flex-col gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR code for ${url}`} className="w-full rounded-lg border border-line" />
              <p className="text-sm break-all text-graphite">{url}</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={url} label="Copy link" />
                <LinkButton href={`/dashboard/events/${id}/share`} variant="secondary" size="sm">
                  Print sign
                </LinkButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-graphite">The QR code is created when you publish.</p>
              <LinkButton href={`/dashboard/events/${id}/preview`} variant="secondary" size="sm" className="self-start">
                Preview guest page
              </LinkButton>
            </div>
          )}
        </Panel>
      </aside>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-sm text-graphite">{label}</dt>
      <dd className="display text-3xl numeric">{value}</dd>
    </div>
  );
}

function GalleryState({
  event,
  revealed,
}: {
  event: { reveal_mode: string; reveal_at: string | null; gallery_visibility: string; timezone: string };
  revealed: boolean;
}) {
  if (event.gallery_visibility === "private") {
    return <p className="text-graphite">The gallery is private. Only you can see the photos.</p>;
  }
  if (revealed) return <p className="text-graphite">The gallery is open to guests.</p>;
  if (event.reveal_mode === "scheduled" && event.reveal_at) {
    return (
      <p className="text-graphite">
        Gallery opens {formatDateTime(event.reveal_at, event.timezone)}, in{" "}
        <Countdown to={event.reveal_at} className="numeric font-semibold text-ink" />.
      </p>
    );
  }
  return <p className="text-graphite">The gallery is hidden until you reveal it.</p>;
}
