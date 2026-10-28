import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { signPaths } from "@/lib/server/media";
import { formatDateTime, formatEventDate } from "@/lib/format";
import { eventTypeLabel } from "@/lib/rules";
import { Panel, StatusPill } from "@/components/ui";
import { AdminEventControls, AdminPhotoGrid } from "./controls";

export const metadata: Metadata = { title: "Event" };

export default async function AdminEventPage({ params }: PageProps<"/admin/events/[id]">) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = admin();
  const { data: event } = await db.from("events").select("*").eq("id", id).maybeSingle();
  if (!event) notFound();

  const [{ data: owner }, { count: guests }, { data: photos }, { data: emails }] = await Promise.all([
    db.from("profiles").select("email, display_name").eq("id", event.owner_id).maybeSingle(),
    db.from("event_guests").select("id", { count: "exact", head: true }).eq("event_id", id),
    db
      .from("photos")
      .select("id, thumbnail_path, display_path, moderation_status, flagged, uploaded_at")
      .eq("event_id", id)
      .eq("upload_status", "complete")
      .order("uploaded_at", { ascending: false })
      .limit(300),
    db.from("guest_emails").select("sent_at, unsubscribed_at, attempts").eq("event_id", id),
  ]);
  const signed = await signPaths((photos ?? []).flatMap((p) => [p.thumbnail_path, p.display_path]));
  const e = emails ?? [];

  const facts: [string, React.ReactNode][] = [
    ["Organiser", <Link key="o" href={`/admin/organisers?q=${encodeURIComponent(owner?.email ?? "")}`} className="text-cobalt hover:underline">{owner?.email}</Link>],
    ["Type", eventTypeLabel(event.event_type)],
    ["Date", formatEventDate(event.event_date, event.start_time, event.end_time)],
    ["Code", <span key="c" className="numeric">{event.code}</span>],
    ["Created", formatDateTime(event.created_at)],
    ["Shots per guest", event.photos_per_guest],
    ["Gallery", `${event.gallery_visibility}, ${event.reveal_mode} reveal`],
    ["Guests", guests ?? 0],
    ["Photos", photos?.length ?? 0],
    ["Emails", `${e.filter((x) => x.sent_at).length} sent, ${e.filter((x) => !x.sent_at && !x.unsubscribed_at).length} waiting`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/events" className="text-[15px] font-semibold text-graphite hover:text-ink">All events</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display-md text-[clamp(28px,4vw,40px)]">{event.title}</h1>
          <StatusPill status={event.status} />
          {event.suspended_at && <span className="rounded-full bg-signal px-2.5 py-0.5 text-sm font-semibold text-white">Suspended</span>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Panel>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-sm text-graphite">{k}</dt>
                <dd className="font-semibold break-all">{v}</dd>
              </div>
            ))}
          </dl>
          {event.status !== "draft" && (
            <Link href={`/e/${event.code}`} target="_blank" className="mt-5 inline-block font-semibold text-cobalt hover:underline">
              Open guest page
            </Link>
          )}
        </Panel>
        <AdminEventControls
          eventId={event.id}
          code={event.code}
          suspendedAt={event.suspended_at}
          suspendedReason={event.suspended_reason}
        />
      </div>

      <AdminPhotoGrid
        eventId={event.id}
        photos={(photos ?? []).map((p, i) => ({
          id: p.id,
          thumb: signed[i * 2] ?? "",
          display: signed[i * 2 + 1] ?? "",
          status: p.moderation_status,
          flagged: p.flagged,
        }))}
      />
    </div>
  );
}
