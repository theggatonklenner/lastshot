import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { shotLimit } from "@/lib/rules";
import { GuestLanding } from "@/components/guest/guest-landing";
import { GuestMessage, guestButton, guestSecondary } from "@/components/guest/guest-shell";

export async function generateMetadata({ params }: PageProps<"/e/[code]">): Promise<Metadata> {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  return {
    title: ctx ? ctx.event.title : "Event not found",
    robots: { index: false, follow: false },
  };
}

export default async function GuestEventPage({ params }: PageProps<"/e/[code]">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, guest, accepting, galleryHref, coverUrl, isOwner } = ctx;

  if (event.suspended_at && !isOwner) {
    return (
      <GuestMessage title="Event unavailable">
        This event isn&apos;t available right now. If you&apos;re a guest, check with the organiser.
      </GuestMessage>
    );
  }

  if (guest?.blocked) {
    return (
      <GuestMessage title="Camera turned off">
        The organiser has turned off the camera on this phone. Ask them if you think this is a mistake.
      </GuestMessage>
    );
  }

  if (event.status === "draft" && isOwner) {
    return (
      <GuestMessage
        title="Not published yet"
        action={
          <Link href={`/dashboard/events/${event.id}/preview`} className={guestButton}>
            Open the preview
          </Link>
        }
      >
        Guests will see this page once you publish the event.
      </GuestMessage>
    );
  }

  if (event.status === "ended" || event.status === "archived") {
    return (
      <GuestMessage
        title="That's a wrap"
        action={
          <div className="flex w-full flex-col gap-3">
            {galleryHref && (
              <Link href={galleryHref} className={guestButton}>
                See the gallery
              </Link>
            )}
            <Link href="/" className={guestSecondary}>
              About Lastshot
            </Link>
          </div>
        }
      >
        {event.title} has ended and isn&apos;t taking photos any more.
        {galleryHref ? " The photos are waiting for you." : ""}
      </GuestMessage>
    );
  }

  return (
    <GuestLanding
      event={event}
      coverUrl={coverUrl}
      accepting={accepting}
      galleryHref={galleryHref}
      joined={
        guest
          ? { displayName: guest.display_name, shotsUsed: guest.photos_submitted, shotsLimit: shotLimit(event) }
          : null
      }
    />
  );
}
