import type { Metadata, Viewport } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { guestUrl } from "@/lib/env";
import { signOne } from "@/lib/server/media";
import { Slideshow } from "./slideshow";

export const metadata: Metadata = {
  title: "Slideshow",
  robots: { index: false },
};
export const viewport: Viewport = { themeColor: "#0b0b0c" };

/** Full-screen slideshow for a TV or projector at the event. Organisers only. */
export default async function SlideshowPage({
  params,
}: PageProps<"/show/[id]">) {
  const { id } = await params;
  const { event } = await requireOwnedEvent(id);
  return (
    <Slideshow
      eventId={event.id}
      title={event.title}
      guestUrl={guestUrl(event.code)}
      shots={event.photos_per_guest}
      logoUrl={event.addon_branding ? await signOne(event.brand_logo_path) : null}
    />
  );
}
