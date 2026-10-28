import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { guestUrl } from "@/lib/env";
import { formatEventDate } from "@/lib/format";
import { LinkButton, Notice, Panel } from "@/components/ui";
import { ShareTools } from "./share-tools";

export const metadata: Metadata = { title: "Share" };

export default async function SharePage({ params, searchParams }: PageProps<"/dashboard/events/[id]/share">) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireOwnedEvent(id);
  const url = guestUrl(event.code);

  if (event.status === "draft") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Notice tone="info">Publish the event to get its QR code and link.</Notice>
        <LinkButton href={`/dashboard/events/${id}`}>Go to event controls</LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {sp.published && (
        <Notice tone="success">Published. Your event is ready for guests.</Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ShareTools
          url={url}
          title={event.title}
          dateLine={event.event_date ? formatEventDate(event.event_date, event.start_time, event.end_time) : ""}
          shots={event.photos_per_guest}
          eventId={id}
        />
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Setting up on the day</h2>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-graphite marker:font-bold marker:text-ink">
            <li>Print the sign and put one on each table, the bar and the entrance. A4 works well in a frame.</li>
            <li>Test it yourself: scan the code with your phone camera and take a shot. You can delete it after.</li>
            <li>
              Tell guests they get {event.photos_per_guest} shots each. Mention it in a speech or on the program.
            </li>
            <li>Watch photos arrive on the Overview tab. Pause new photos or end the event from there.</li>
            <li>When it&apos;s over, reveal the gallery if it isn&apos;t already open and share the same link.</li>
          </ol>
          <p className="mt-5 text-sm text-graphite">
            Guests need a phone with a modern browser (Safari on iPhone, Chrome on Android). No app or account.
          </p>
        </Panel>
      </div>
    </div>
  );
}
