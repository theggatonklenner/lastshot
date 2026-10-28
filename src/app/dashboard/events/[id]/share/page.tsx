import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { guestUrl } from "@/lib/env";
import { formatEventDate } from "@/lib/format";
import { LinkButton, Notice, Panel, buttonClass } from "@/components/ui";
import { ShareTools } from "./share-tools";

export const metadata: Metadata = { title: "Share" };

export default async function SharePage({
  params,
  searchParams,
}: PageProps<"/dashboard/events/[id]/share">) {
  const { id } = await params;
  const sp = await searchParams;
  const { event } = await requireOwnedEvent(id);
  const url = guestUrl(event.code);

  if (event.status === "draft") {
    return (
      <div className="flex flex-col items-start gap-4">
        <Notice tone="info">
          Publish the event to get its QR code and link.
        </Notice>
        <LinkButton href={`/dashboard/events/${id}`}>
          Go to event controls
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {sp.published && (
        <Notice tone="success">
          Published. Your event is ready for guests.
        </Notice>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <ShareTools
          url={url}
          title={event.title}
          dateLine={
            event.event_date
              ? formatEventDate(
                  event.event_date,
                  event.start_time,
                  event.end_time,
                )
              : ""
          }
          shots={event.photos_per_guest}
          eventId={id}
        />
        <div className="flex flex-col gap-6">
          <Panel>
            <h2 className="mb-2 text-lg font-bold">Slideshow for a TV</h2>
            <p className="mb-4 text-graphite">
              Plug a laptop into a TV or projector and open the slideshow. New
              photos appear as soon as they&apos;re taken, with the QR code in
              the corner so more guests join in.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={`/show/${id}`}
                target="_blank"
                rel="noopener"
                className={buttonClass("primary")}
              >
                Open slideshow
              </a>
              <span className="text-sm text-graphite">
                Opens in a new tab. Press F for full screen.
              </span>
            </div>
            {event.reveal_mode !== "live" && (
              <p className="mt-4 text-sm text-graphite">
                Your gallery isn&apos;t live, so anyone who can see the TV will
                see photos before the reveal.
              </p>
            )}
          </Panel>
          <Panel>
            <h2 className="mb-4 text-lg font-bold">Setting up on the day</h2>
            <ol className="flex list-decimal flex-col gap-3 pl-5 text-graphite marker:font-bold marker:text-ink">
              <li>
                Print the sign and put one on each table, the bar and the
                entrance. A4 works well in a frame.
              </li>
              <li>
                Test it yourself: scan the code with your phone camera and take
                a shot. You can delete it after.
              </li>
              <li>
                Tell guests they get {event.photos_per_guest} shots each.
                Mention it in a speech or on the program.
              </li>
              <li>
                Put the slideshow on a TV if you have one. Watch photos arrive
                on the Overview tab. Pause new photos or end the event from
                there.
              </li>
              <li>
                When it&apos;s over, reveal the gallery if it isn&apos;t already
                open and share the same link.
              </li>
            </ol>
            <p className="mt-5 text-sm text-graphite">
              Guests need a phone with a modern browser (Safari on iPhone,
              Chrome on Android). No app or account.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
