import Link from "next/link";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { StatusPill } from "@/components/ui";
import { formatEventDate } from "@/lib/format";
import { EventTabs } from "./tabs";
import { LiveRefresh } from "./live-refresh";

export default async function EventLayout({ children, params }: LayoutProps<"/dashboard/events/[id]">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnedEvent(id);
  const { data: stats } = await supabase.rpc("event_stats", { p_event_ids: [id] });

  return (
    <div className="flex flex-col gap-6">
      <LiveRefresh eventId={event.id} />
      <div className="flex flex-col gap-3">
        <Link href="/dashboard" className="text-[15px] font-semibold text-graphite hover:text-ink">
          All events
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="display-md text-[clamp(28px,4vw,40px)]">{event.title}</h1>
          <StatusPill status={event.status} />
        </div>
        <p className="text-graphite">{formatEventDate(event.event_date, event.start_time, event.end_time)}</p>
      </div>
      <EventTabs id={event.id} pendingReview={stats?.[0]?.pending_review ?? 0} />
      <div>{children}</div>
    </div>
  );
}
