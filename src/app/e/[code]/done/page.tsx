import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { formatDateTime } from "@/lib/format";
import { Countdown } from "@/components/countdown";
import { GuestMessage, guestButton } from "@/components/guest/guest-shell";

export const metadata: Metadata = { title: "Roll finished", robots: { index: false } };

export default async function DonePage({ params }: PageProps<"/e/[code]/done">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, guest, access, galleryHref } = ctx;
  if (!guest) redirect(`/e/${code}`);

  const shots = guest.photos_submitted;
  let galleryLine: React.ReactNode;
  if (access.allowed) {
    galleryLine = "The gallery is open. See what everyone else caught.";
  } else if (access.reason === "not_revealed" && access.revealAt) {
    galleryLine = (
      <>
        Photos develop {formatDateTime(access.revealAt, event.timezone)}. That&apos;s in{" "}
        <Countdown to={access.revealAt} className="numeric font-semibold text-cream" />. Keep this link to come back.
      </>
    );
  } else if (access.reason === "not_revealed") {
    galleryLine = "The organiser will open the gallery soon. Keep this link to come back.";
  } else {
    galleryLine = "The organiser is collecting these photos privately.";
  }

  return (
    <GuestMessage
      title="That's the roll"
      action={
        galleryHref && access.allowed ? (
          <Link href={galleryHref} className={guestButton}>
            See the gallery
          </Link>
        ) : galleryHref ? (
          <Link href={galleryHref} className="font-semibold text-flash underline underline-offset-4">
            Gallery page
          </Link>
        ) : null
      }
    >
      <p>
        All {shots === 1 ? "1 photo is" : `${shots} photos are`} saved to {event.title}. Nice work.
      </p>
      <p className="mt-3">{galleryLine}</p>
    </GuestMessage>
  );
}
