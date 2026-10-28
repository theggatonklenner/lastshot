import { formatEventDate } from "@/lib/format";
import type { EventRecord } from "@/lib/database.types";
import { GuestShell } from "./guest-shell";
import { JoinPanel } from "./join-panel";

export function GuestLanding({
  event,
  coverUrl,
  joined,
  accepting,
  galleryHref,
  preview,
  previewCameraHref,
}: {
  event: EventRecord;
  coverUrl: string | null;
  joined: { displayName: string | null; shotsUsed: number; shotsLimit: number } | null;
  accepting: boolean;
  galleryHref: string | null;
  preview?: boolean;
  previewCameraHref?: string;
}) {
  return (
    <GuestShell cover={coverUrl} accent={event.theme === "custom" ? event.accent_color : "#2546d8"}>
      {preview && (
        <p className="relative z-10 -mt-14 mb-6 inline-block rounded-full bg-flash px-3 py-1 text-sm font-bold text-body">
          Preview of the guest page
        </p>
      )}
      <div className="relative z-10 -mt-10 flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="display text-[clamp(36px,10.5vw,60px)] break-words">{event.title}</h1>
          {event.event_date && <p className="text-cream-dim">{formatEventDate(event.event_date, event.start_time, event.end_time)}</p>}
        </div>
        {event.description && <p className="text-lg whitespace-pre-line text-cream/90">{event.description}</p>}
        <div className="flex items-center gap-4 rounded-[18px] bg-body-2 p-4">
          <span className="display numeric flex h-14 w-16 shrink-0 items-center justify-center rounded-[10px] bg-black text-3xl text-cream">
            {String(event.photos_per_guest).padStart(2, "0")}
          </span>
          <p className="text-[15px] text-cream-dim">
            Your phone becomes a disposable camera with {event.photos_per_guest === 1 ? "one shot" : `${event.photos_per_guest} shots`}.
            No app, no account. Every photo goes to one shared roll.
          </p>
        </div>
        <JoinPanel
          code={event.code}
          limit={event.photos_per_guest}
          joined={joined}
          needsCode={!!event.access_code_hash}
          accepting={accepting}
          galleryHref={galleryHref}
          preview={preview}
          previewCameraHref={previewCameraHref}
          emailCapture={event.email_capture_enabled && event.gallery_visibility !== "private"}
        />
      </div>
    </GuestShell>
  );
}
