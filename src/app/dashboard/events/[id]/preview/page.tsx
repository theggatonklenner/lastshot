import type { Metadata } from "next";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { signOne } from "@/lib/server/media";
import { GuestLanding } from "@/components/guest/guest-landing";
import { LinkButton } from "@/components/ui";

export const metadata: Metadata = { title: "Guest preview" };

export default async function PreviewPage({ params }: PageProps<"/dashboard/events/[id]/preview">) {
  const { id } = await params;
  const { event } = await requireOwnedEvent(id);
  const [coverUrl, logoUrl] = await Promise.all([signOne(event.cover_image_path), signOne(event.brand_logo_path)]);
  const q = new URLSearchParams({
    theme: event.theme,
    accent: event.accent_color,
    shots: String(event.photos_per_guest),
    title: event.title,
    stamp: event.date_stamp_enabled ? "1" : "0",
    back: `/dashboard/events/${id}/preview`,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-graphite">This is what guests see after scanning the QR code, shown at phone size.</p>
        <LinkButton href={`/dashboard/events/${id}/settings`} variant="secondary" size="sm">
          Edit settings
        </LinkButton>
      </div>
      <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[36px] border-[10px] border-ink shadow-2xl">
        <div className="max-h-[780px] overflow-y-auto">
          <GuestLanding
            event={event}
            brand={event.addon_branding ? { logoUrl } : null}
            coverUrl={coverUrl}
            accepting
            galleryHref={null}
            joined={null}
            preview
            previewCameraHref={`/try?${q.toString()}`}
          />
        </div>
      </div>
    </div>
  );
}
