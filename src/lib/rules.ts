// Pure event rules shared by server routes and pages. Mirrors the SQL helpers
// event_gallery_revealed() and event_accepting_submissions().
import type { EventRecord, EventType } from "@/lib/database.types";

type RevealFields = Pick<EventRecord, "reveal_mode" | "reveal_at" | "revealed_at">;
type SubmissionFields = Pick<EventRecord, "status" | "submissions_closed_at"> & {
  suspended_at?: string | null;
  lock_until_start?: boolean;
  starts_at?: string | null;
};
type VisibilityFields = RevealFields &
  Pick<EventRecord, "gallery_visibility" | "status"> & { suspended_at?: string | null };

export function galleryRevealed(e: RevealFields, now = new Date()): boolean {
  switch (e.reveal_mode) {
    case "live":
      return true;
    case "scheduled":
      return !!e.reveal_at && now.getTime() >= new Date(e.reveal_at).getTime();
    case "manual":
      return !!e.revealed_at;
  }
}

export function acceptingSubmissions(e: SubmissionFields, now = new Date()): boolean {
  return (
    (e.status === "published" || e.status === "active") &&
    !e.submissions_closed_at &&
    !e.suspended_at &&
    !cameraLocked(e, now)
  );
}

/** Cameras stay locked until the start time when the organiser asks for it. */
export function cameraLocked(e: { lock_until_start?: boolean; starts_at?: string | null }, now = new Date()) {
  return !!e.lock_until_start && !!e.starts_at && now.getTime() < new Date(e.starts_at).getTime();
}

/** Show the save-the-date countdown: the event has a start time that hasn't arrived yet. */
export function beforeStart(e: { starts_at?: string | null }, now = new Date()) {
  return !!e.starts_at && now.getTime() < new Date(e.starts_at).getTime();
}

export type GalleryAccess =
  | { allowed: true }
  | { allowed: false; reason: "private" | "not_revealed" | "join_required" | "unavailable"; revealAt?: string | null };

/** Whether a viewer may see approved photos for this event. Organisers always can. */
export function galleryAccess(
  e: VisibilityFields,
  viewer: { isOwner: boolean; isGuest: boolean },
  now = new Date(),
): GalleryAccess {
  if (viewer.isOwner) return { allowed: true };
  if (e.status === "draft" || e.suspended_at) return { allowed: false, reason: "unavailable" };
  if (e.gallery_visibility === "private") return { allowed: false, reason: "private" };
  if (e.gallery_visibility === "guests" && !viewer.isGuest) {
    return { allowed: false, reason: "join_required" };
  }
  if (!galleryRevealed(e, now)) {
    return {
      allowed: false,
      reason: "not_revealed",
      revealAt: e.reveal_mode === "scheduled" ? e.reveal_at : null,
    };
  }
  return { allowed: true };
}

/** Mirrors SQL event_ready_for_email(): the gallery is open and no more photos are coming. */
export function readyForEmail(
  e: VisibilityFields,
  now = new Date(),
): boolean {
  return (
    galleryRevealed(e, now) &&
    e.gallery_visibility !== "private" &&
    !e.suspended_at &&
    e.status !== "draft" &&
    (e.status === "ended" || e.status === "archived" || e.reveal_mode !== "live")
  );
}

export const RETENTION_DAYS = 180;
export const EXTENDED_RETENTION_DAYS = 730;

/** Mirrors SQL event_retention_until(): when photos will be deleted, or null if kept. */
export function retentionUntil(
  e: Pick<EventRecord, "keep_photos" | "ended_at" | "event_date" | "created_at"> & {
    addon_storage?: boolean;
    addon_storage_1y?: boolean;
  },
): Date | null {
  if (e.keep_photos) return null;
  const base = e.ended_at
    ? new Date(e.ended_at)
    : e.event_date
      ? new Date(`${e.event_date}T00:00:00Z`).getTime() + 86_400_000
      : new Date(e.created_at);
  const days = e.addon_storage ? EXTENDED_RETENTION_DAYS : e.addon_storage_1y ? 365 : RETENTION_DAYS;
  return new Date(new Date(base).getTime() + days * 86_400_000);
}

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "wedding", label: "Wedding" },
  { value: "birthday", label: "Birthday" },
  { value: "party", label: "Party" },
  { value: "school", label: "School event" },
  { value: "concert", label: "Concert" },
  { value: "corporate", label: "Work event" },
  { value: "other", label: "Something else" },
];

export function eventTypeLabel(t: EventType): string {
  return EVENT_TYPES.find((x) => x.value === t)?.label ?? "Event";
}

export const STATUS_LABEL: Record<EventRecord["status"], string> = {
  draft: "Draft",
  published: "Ready for guests",
  active: "Shooting",
  ended: "Ended",
  archived: "Archived",
};

type BonusFields = Pick<EventRecord, "photos_per_guest" | "bonus_shots" | "bonus_at"> & { mystery_at?: string | null };

/** Shots each guest gets right now, including bonus and mystery shots once unlocked. Mirrors public.event_shot_limit(). */
export function shotLimit(e: BonusFields, now: Date = new Date()): number {
  return e.photos_per_guest + (bonusUnlocked(e, now) ? e.bonus_shots : 0) + (mysteryUnlocked(e, now) ? 1 : 0);
}

export function mysteryUnlocked(e: { mystery_at?: string | null }, now: Date = new Date()): boolean {
  return !!e.mystery_at && new Date(e.mystery_at).getTime() <= now.getTime();
}

export const RETAKES_PER_ROLL = 1;
export const RETAKE_WINDOW_MINUTES = 10;

export function bonusUnlocked(e: BonusFields, now: Date = new Date()): boolean {
  return e.bonus_shots > 0 && !!e.bonus_at && new Date(e.bonus_at).getTime() <= now.getTime();
}

/** Bonus shots that are set but not unlocked yet. */
export function bonusPending(e: BonusFields, now: Date = new Date()): boolean {
  return e.bonus_shots > 0 && !!e.bonus_at && new Date(e.bonus_at).getTime() > now.getTime();
}

export function remainingShots(limit: number, used: number): number {
  return Math.max(0, limit - used);
}

/** "08" style counter text. */
export function counterText(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

/** True when an ISO timestamp is in the past. */
export function isPast(iso: string, now = new Date()): boolean {
  return new Date(iso).getTime() < now.getTime();
}
