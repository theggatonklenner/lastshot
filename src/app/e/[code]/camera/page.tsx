import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { shotLimit } from "@/lib/rules";
import { resolveTheme } from "@/lib/themes";
import { Camera } from "@/components/camera/camera";

export const metadata: Metadata = { title: "Camera", robots: { index: false } };

export default async function CameraPage({ params }: PageProps<"/e/[code]/camera">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, guest, accepting } = ctx;

  if (!guest || guest.blocked || !accepting) redirect(`/e/${code}`);
  if (guest.photos_submitted >= shotLimit(event)) redirect(`/e/${code}/done`);

  return (
    <Camera
      code={code}
      title={event.title}
      theme={resolveTheme(event.theme, event.accent_color)}
      dateStamp={event.date_stamp_enabled}
      frame={
        event.addon_frame && (event.frame_text || event.frame_subtext)
          ? { text: event.frame_text, subtext: event.frame_subtext, color: event.frame_color }
          : null
      }
      limit={shotLimit(event)}
      initialUsed={guest.photos_submitted}
      allowLibrary={event.camera_roll_uploads_enabled}
      exitHref={`/e/${code}`}
      doneHref={`/e/${code}/done`}
    />
  );
}
