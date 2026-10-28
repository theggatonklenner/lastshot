import { beforeStart, cameraLocked, galleryRevealed } from "@/lib/rules";
import { googleCalendarUrl } from "@/lib/calendar";
import { SaveTheDate } from "./save-the-date";
import { formatDateTime, formatEventDate } from "@/lib/format";
import type { EventRecord } from "@/lib/database.types";
import { GuestShell, type GuestBrand } from "./guest-shell";
import { JoinPanel } from "./join-panel";

export function GuestLanding({
  event,
  coverUrl,
  joined,
  accepting,
  galleryHref,
  preview,
  previewCameraHref,
  brand,
  link,
}: {
  /** The guest link, for the calendar entry. */
  link?: string;
  event: EventRecord;
  coverUrl: string | null;
  joined: { displayName: string | null; shotsUsed: number; shotsLimit: number } | null;
  accepting: boolean;
  galleryHref: string | null;
  preview?: boolean;
  previewCameraHref?: string;
  brand?: GuestBrand;
}) {
  return (
    <GuestShell cover={coverUrl} accent={event.theme === "custom" ? event.accent_color : "#2546d8"} brand={brand}>
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
            {event.bonus_shots > 0 && event.bonus_at && (
              <span className="mt-1 block font-semibold text-flash">
                +{event.bonus_shots} bonus shots unlock {formatDateTime(event.bonus_at, event.timezone)}.
              </span>
            )}
            {event.mystery_at && (
              <span className="mt-1 block font-semibold text-flash">
                A mystery shot with a surprise challenge unlocks {formatDateTime(event.mystery_at, event.timezone)}.
              </span>
            )}
          </p>
        </div>
        {!preview && beforeStart(event) && event.starts_at && (
          <SaveTheDate
            code={event.code}
            startsAt={event.starts_at}
            whenText={formatStart(event.starts_at, event.timezone)}
            locked={cameraLocked(event)}
            googleUrl={googleCalendarUrl(event, link ?? "")}
          />
        )}
        {!(cameraLocked(event) && !preview) && (
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
          smsCapture={event.addon_sms && event.gallery_visibility !== "private"}
          questions={event.addon_export ? (event.lead_questions ?? []) : []}
          pushCapture={event.gallery_visibility !== "private" && (event.reveal_mode !== "live" ? !galleryRevealed(event) : event.status !== "ended" && event.status !== "archived")}
        />
        )}
      </div>
    </GuestShell>
  );
}

/** "Saturday 7 November at 6:00 pm" in the event's time zone. */
function formatStart(iso: string, timeZone: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone }).format(d);
  const time = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone }).format(d);
  return `${day} at ${time}`;
}
