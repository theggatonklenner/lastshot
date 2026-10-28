import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { loadGalleryPage } from "@/lib/server/gallery";
import { formatDateTime, formatEventDate } from "@/lib/format";
import { GuestMessage, GuestShell, guestButton, guestSecondary } from "@/components/guest/guest-shell";
import { RevealWait } from "./reveal-wait";
import { GalleryView } from "./gallery-view";

export const metadata: Metadata = { title: "Gallery", robots: { index: false } };

export default async function GalleryPage({ params }: PageProps<"/e/[code]/gallery">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, access, isOwner, accepting } = ctx;

  if (!access.allowed) {
    if (access.reason === "join_required") {
      return (
        <GuestMessage brand={ctx.brand}
          title="Join to see the photos"
          action={
            <Link href={`/e/${code}`} className={guestButton}>
              {accepting ? "Join the event" : "Back to the event"}
            </Link>
          }
        >
          This gallery is for guests of {event.title}. Open the event on this phone to see it.
        </GuestMessage>
      );
    }
    if (access.reason === "private") {
      return (
        <GuestMessage brand={ctx.brand} title="Private gallery">
          The organiser of {event.title} is keeping these photos private.
        </GuestMessage>
      );
    }
    return (
      <GuestMessage brand={ctx.brand}
        title="Still developing"
        action={
          <Link href={`/e/${code}`} className={guestSecondary}>
            Back to the event
          </Link>
        }
      >
        {access.revealAt ? (
          <>
            <p>
              The photos from {event.title} develop {formatDateTime(access.revealAt, event.timezone)}.
            </p>
            <RevealWait to={access.revealAt} />
          </>
        ) : (
          <p>The organiser will open the gallery when the event wraps up. Check back with this link.</p>
        )}
      </GuestMessage>
    );
  }

  const downloads = isOwner || event.guest_downloads_enabled;
  const first = await loadGalleryPage(event, { sort: "newest", offset: 0, includeOriginals: downloads });

  return (
    <GuestShell brand={ctx.brand}>
      <div className="flex flex-col gap-6 pt-10">
        <div className="flex flex-col gap-2">
          <Link href={`/e/${code}`} className="text-[15px] font-semibold text-cream-dim hover:text-cream">
            {event.title}
          </Link>
          <h1 className="display text-[clamp(36px,10vw,56px)]">The roll</h1>
          {(event.status === "ended" || event.status === "archived") && (
            <Link
              href={`/e/${code}/wrapped`}
              className="self-start rounded-full bg-flash px-4 py-1.5 text-sm font-bold text-body"
            >
              See the night, wrapped
            </Link>
          )}
        </div>
        <GalleryView
          code={code}
          title={event.title}
          timezone={event.timezone}
          initial={first}
          downloads={downloads}
          showNames={event.show_guest_names}
          canMine={!!ctx.guest && !ctx.guest.blocked}
          dateLine={event.event_date ? formatEventDate(event.event_date, null, null) : ""}
        />
      </div>
    </GuestShell>
  );
}
