import { z } from "zod";

const time = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

/** Fields the organiser can edit. Status changes go through dedicated actions. */
export const EventInput = z
  .object({
    title: z.string().trim().min(1, "Give the event a name.").max(120),
    description: z.string().trim().max(1000).nullable().optional(),
    event_type: z.enum(["wedding", "birthday", "party", "school", "concert", "corporate", "other"]),
    event_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.")
      .nullable()
      .optional()
      .or(z.literal("").transform(() => null)),
    timezone: z.string().max(64).optional(),
    start_time: time,
    end_time: time,
    photos_per_guest: z.coerce.number().int().min(1, "At least 1 shot.").max(100, "100 shots at most."),
    bonus_shots: z.coerce.number().int().min(0).max(50, "50 bonus shots at most."),
    bonus_at: z.iso.datetime({ offset: true }).nullable().optional(),
    mystery_at: z.iso.datetime({ offset: true }).nullable().optional(),
    mystery_prompt: z
      .string()
      .trim()
      .max(2600)
      .refine((v) => v.split("\n").filter((l) => l.trim()).length <= 20, "Add up to 20 challenges.")
      .refine((v) => v.split("\n").every((l) => l.trim().length <= 120), "Keep each challenge to 120 characters.")
      .nullable()
      .optional(),
    reveal_mode: z.enum(["live", "scheduled", "manual"]),
    reveal_at: z.iso.datetime({ offset: true }).nullable().optional(),
    gallery_visibility: z.enum(["guests", "public", "private"]),
    guest_downloads_enabled: z.boolean(),
    camera_roll_uploads_enabled: z.boolean(),
    require_approval: z.boolean(),
    show_guest_names: z.boolean(),
    date_stamp_enabled: z.boolean(),
    email_capture_enabled: z.boolean(),
    theme: z.enum(["classic", "vintage", "minimal", "custom"]),
    accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    lock_until_start: z.boolean().default(false),
    film_looks: z.array(z.enum(["classic", "vintage", "bw", "warm", "cool", "faded", "true"])).max(7).default([]),
  })
  .refine((v) => v.reveal_mode !== "scheduled" || !!v.reveal_at, {
    message: "Pick when the gallery opens.",
    path: ["reveal_at"],
  })
  .refine((v) => v.bonus_shots === 0 || !!v.bonus_at, {
    message: "Pick when the bonus shots unlock.",
    path: ["bonus_at"],
  })
  .transform((v) => (v.bonus_shots === 0 ? { ...v, bonus_at: null } : v));

export type EventInputType = z.infer<typeof EventInput>;

export const EVENT_DEFAULTS: EventInputType = {
  title: "",
  description: null,
  event_type: "party",
  event_date: null,
  timezone: "Australia/Sydney",
  start_time: null,
  end_time: null,
  photos_per_guest: 12,
  bonus_shots: 0,
  bonus_at: null,
  mystery_at: null,
  mystery_prompt: null,
  reveal_mode: "live",
  reveal_at: null,
  gallery_visibility: "guests",
  guest_downloads_enabled: true,
  camera_roll_uploads_enabled: false,
  require_approval: false,
  show_guest_names: true,
  date_stamp_enabled: true,
  email_capture_enabled: true,
  theme: "classic",
  accent_color: "#2546D8",
  film_looks: [],
  lock_until_start: false,
};

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the highlighted fields.";
}
