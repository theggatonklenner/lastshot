import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganiser } from "@/lib/server/organiser";
import { signPaths } from "@/lib/server/media";
import { formatEventDate, pluralise } from "@/lib/format";
import { eventTypeLabel } from "@/lib/rules";
import { EmptyState, LinkButton, Notice, StatusPill } from "@/components/ui";
import type { EventRecord } from "@/lib/database.types";

export const metadata: Metadata = { title: "Your events" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const sp = await searchParams;
  const { supabase, user } = await requireOrganiser();
  const { data } = await supabase.from("events").select("*").order("created_at", { ascending: false });
  const events = (data ?? []) as EventRecord[];

  const [statsRes, covers] = await Promise.all([
    events.length ? supabase.rpc("event_stats", { p_event_ids: events.map((e) => e.id) }) : Promise.resolve({ data: [] }),
    signPaths(events.map((e) => e.cover_image_path)),
  ]);
  const stats = new Map((statsRes.data ?? []).map((s) => [s.event_id, s]));

  const live = events.filter((e) => e.status !== "archived");
  const archived = events.filter((e) => e.status === "archived");

  return (
    <div className="flex flex-col gap-8">
      {sp.deleted && <Notice tone="success">Event deleted, along with all of its photos.</Notice>}
      {sp.password === "updated" && <Notice tone="success">Your new password is saved.</Notice>}
      {sp.left && <Notice tone="success">You&apos;ve left that event.</Notice>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display-md text-4xl">Your events</h1>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No rolls loaded yet"
          action={
            <LinkButton href="/dashboard/new" size="lg">
              Create your first event
            </LinkButton>
          }
        >
          Create an event to get a QR code for your guests. You can keep it as a draft until you&apos;re ready.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((e) => (
            <EventCard key={e.id} event={e} cover={covers[events.indexOf(e)]} stats={stats.get(e.id)} shared={e.owner_id !== user.id} />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-lg font-bold">Archived ({archived.length})</summary>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((e) => (
              <EventCard key={e.id} event={e} cover={covers[events.indexOf(e)]} stats={stats.get(e.id)} shared={e.owner_id !== user.id} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function EventCard({
  event,
  cover,
  stats,
  shared,
}: {
  shared: boolean;
  event: EventRecord;
  cover: string | null;
  stats?: { guests: number; photos: number; pending_review: number };
}) {
  return (
    <li>
      <Link
        href={`/dashboard/events/${event.id}`}
        className="group flex h-full flex-col overflow-hidden rounded-panel border border-line bg-card transition-colors hover:border-ink/40"
      >
        <div className="relative aspect-[16/9] bg-body">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <div className="grain flex size-full items-end p-4" style={{ background: event.accent_color }}>
              <span className="display line-clamp-2 text-2xl text-white/90">{event.title}</span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex gap-1.5">
            <StatusPill status={event.status} />
            {shared && (
              <span className="rounded-full bg-card/90 px-2.5 py-0.5 text-sm font-semibold text-ink">Shared with you</span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          <h2 className="line-clamp-1 text-lg font-bold">{event.title}</h2>
          <p className="text-[15px] text-graphite">
            {eventTypeLabel(event.event_type)}, {formatEventDate(event.event_date)}
          </p>
          <p className="mt-auto pt-3 text-[15px] font-semibold">
            {pluralise(stats?.photos ?? 0, "photo")}, {pluralise(stats?.guests ?? 0, "guest")}
            {stats?.pending_review ? <span className="text-cobalt">, {stats.pending_review} to review</span> : null}
          </p>
        </div>
      </Link>
    </li>
  );
}
