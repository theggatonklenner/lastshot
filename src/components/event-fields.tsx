"use client";

import type { EventInputType } from "@/lib/event-schema";
import { EVENT_TYPES } from "@/lib/rules";
import { THEMES, type ThemeId } from "@/lib/themes";
import { isoToLocalInput, localInputToIso } from "@/lib/format";
import { Choice, Field, Input, Select, Textarea, Toggle, cx } from "@/components/ui";
import { FilterPreview } from "@/components/filter-preview";
import type { PhotoFrame } from "@/lib/client/develop";

type Props = {
  value: EventInputType;
  set: <K extends keyof EventInputType>(key: K, v: EventInputType[K]) => void;
  errors?: Partial<Record<keyof EventInputType, string>>;
};

export function BasicsFields({ value, set, errors }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="Event name" htmlFor="title" error={errors?.title}>
        <Input
          id="title"
          value={value.title}
          maxLength={120}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Mia and Jordan's wedding"
          autoFocus
        />
      </Field>
      <Field label="What kind of event is it?" htmlFor="event_type">
        <Select
          id="event_type"
          value={value.event_type}
          onChange={(e) => set("event_type", e.target.value as EventInputType["event_type"])}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="event_date" error={errors?.event_date}>
          <Input
            id="event_date"
            type="date"
            value={value.event_date ?? ""}
            onChange={(e) => set("event_date", e.target.value || null)}
          />
        </Field>
        <Field label="Starts (optional)" htmlFor="start_time">
          <Input
            id="start_time"
            type="time"
            value={value.start_time ?? ""}
            onChange={(e) => set("start_time", e.target.value || null)}
          />
        </Field>
        <Field label="Ends (optional)" htmlFor="end_time">
          <Input
            id="end_time"
            type="time"
            value={value.end_time ?? ""}
            onChange={(e) => set("end_time", e.target.value || null)}
          />
        </Field>
      </div>
      <Field label="Note for guests (optional)" htmlFor="description" hint="Shown on the page guests see after scanning.">
        <Textarea
          id="description"
          value={value.description ?? ""}
          maxLength={1000}
          onChange={(e) => set("description", e.target.value || null)}
          placeholder="Snap the moments we'll miss. Photos open after dinner."
        />
      </Field>
    </div>
  );
}

const SHOT_PRESETS = [8, 12, 24, 27];

export function RollFields({ value, set, errors, frame }: Props & { frame?: PhotoFrame | null }) {
  return (
    <div className="flex flex-col gap-8">
      <Field
        label="Shots per guest"
        htmlFor="photos_per_guest"
        error={errors?.photos_per_guest}
        hint="Fewer shots make every photo count. You can raise this later."
      >
        <div className="flex flex-wrap items-center gap-2">
          {SHOT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set("photos_per_guest", n)}
              className={cx(
                "display h-12 min-w-14 rounded-control border px-3 text-lg transition-colors",
                value.photos_per_guest === n ? "border-cobalt bg-cobalt text-white" : "border-line bg-card hover:border-ink/40",
              )}
              aria-pressed={value.photos_per_guest === n}
            >
              {n}
            </button>
          ))}
          <Input
            id="photos_per_guest"
            type="number"
            min={1}
            max={100}
            inputMode="numeric"
            aria-label="Custom number of shots"
            className="w-24"
            value={value.photos_per_guest}
            onChange={(e) => set("photos_per_guest", Number(e.target.value))}
          />
        </div>
      </Field>

      <div className="flex flex-col gap-3">
        <Toggle
          checked={value.bonus_shots > 0}
          onChange={(on) => {
            set("bonus_shots", on ? 5 : 0);
            if (!on) set("bonus_at", null);
          }}
          label="Bonus shots later on"
          description="Give everyone extra shots at a set time, like +5 at 10pm, so photos keep coming late in the night."
        />
        {value.bonus_shots > 0 && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <Field label="Extra shots" htmlFor="bonus_shots" error={errors?.bonus_shots}>
              <Select
                id="bonus_shots"
                value={value.bonus_shots}
                onChange={(e) => set("bonus_shots", Number(e.target.value))}
              >
                {[2, 3, 5, 8, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    +{n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Unlocks at"
              htmlFor="bonus_at"
              error={errors?.bonus_at}
              hint="Uses your device's time zone. Guests who've run out get a heads-up."
            >
              <Input
                id="bonus_at"
                type="datetime-local"
                value={isoToLocalInput(value.bonus_at ?? null)}
                onChange={(e) => set("bonus_at", localInputToIso(e.target.value))}
              />
            </Field>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Toggle
          checked={!!value.mystery_at}
          onChange={(on) => {
            if (on) {
              const d = new Date(Date.now() + 2 * 3600_000);
              d.setMinutes(0, 0, 0);
              set("mystery_at", d.toISOString());
            } else {
              set("mystery_at", null);
              set("mystery_prompt", null);
            }
          }}
          label="Mystery shot"
          description="At a set time, every guest gets one extra shot with a surprise challenge, like “Photograph whoever is closest to you right now”."
        />
        {value.mystery_at && (
          <div className="grid gap-4 sm:grid-cols-[1fr_1.4fr]">
            <Field label="Unlocks at" htmlFor="mystery_at" hint="Uses your device's time zone.">
              <Input
                id="mystery_at"
                type="datetime-local"
                value={isoToLocalInput(value.mystery_at ?? null)}
                onChange={(e) => set("mystery_at", localInputToIso(e.target.value))}
              />
            </Field>
            <Field
              label="Challenge (optional)"
              htmlFor="mystery_prompt"
              error={errors?.mystery_prompt}
              hint="Leave empty and each guest gets a different random challenge."
            >
              <Input
                id="mystery_prompt"
                value={value.mystery_prompt ?? ""}
                maxLength={120}
                placeholder="Get a photo with the birthday girl"
                onChange={(e) => set("mystery_prompt", e.target.value || null)}
              />
            </Field>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-[15px] font-semibold">Camera style</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(THEMES) as ThemeId[]).map((id) => {
            const t = THEMES[id];
            const shell = id === "custom" ? value.accent_color : t.shell;
            const selected = value.theme === id;
            return (
              <label
                key={id}
                className={cx(
                  "flex cursor-pointer items-center gap-4 rounded-control border bg-card p-3 transition-colors",
                  selected ? "border-cobalt ring-2 ring-cobalt/20" : "border-line hover:border-ink/30",
                )}
              >
                <input
                  type="radio"
                  name="theme"
                  className="sr-only"
                  checked={selected}
                  onChange={() => set("theme", id)}
                />
                <ThemeSwatch shell={shell} filter={t.filter} />
                <span className="flex flex-col">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-graphite">{t.description}</span>
                </span>
              </label>
            );
          })}
        </div>
        {value.theme === "custom" && (
          <label className="flex items-center gap-3 pt-1">
            <input
              type="color"
              value={value.accent_color}
              onChange={(e) => set("accent_color", e.target.value)}
              className="h-11 w-14 cursor-pointer rounded-lg border border-line bg-card p-1"
            />
            <span className="font-semibold">Camera colour</span>
            <span className="text-graphite">{value.accent_color.toUpperCase()}</span>
          </label>
        )}
      </fieldset>

      <div className="divide-y divide-line rounded-control border border-line bg-card px-4">
        <Toggle
          checked={value.date_stamp_enabled}
          onChange={(v) => set("date_stamp_enabled", v)}
          label="Date stamp"
          description="Prints the date in the corner of each photo, like a real film camera."
        />
        <Toggle
          checked={value.camera_roll_uploads_enabled}
          onChange={(v) => set("camera_roll_uploads_enabled", v)}
          label="Allow photos from camera roll"
          description="Guests can add existing photos. They still count towards the shot limit."
        />
      </div>

      <FilterPreview themeId={value.theme} accent={value.accent_color} dateStamp={value.date_stamp_enabled} frame={frame} />
    </div>
  );
}

function ThemeSwatch({ shell, filter }: { shell: string; filter: string }) {
  const photo =
    filter === "vintage"
      ? "linear-gradient(160deg,#e8c99b,#a77b55 60%,#5d4632)"
      : filter === "none"
        ? "linear-gradient(160deg,#9fc4e8,#4d7fb3 55%,#2b3f57)"
        : "linear-gradient(160deg,#ffb36b,#e2564a 55%,#3b2b5c)";
  return (
    <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-[10px]" style={{ background: shell }}>
      <span className="grain block h-9 w-12 rounded-[4px] border-2 border-body" style={{ background: photo }} />
    </span>
  );
}

export function GalleryFields({
  value,
  set,
  errors,
  accessCode,
  setAccessCode,
  hasAccessCode,
}: Props & { accessCode: string; setAccessCode: (v: string) => void; hasAccessCode?: boolean }) {
  return (
    <div className="flex flex-col gap-8">
      <Field label="When do photos appear in the gallery?" error={errors?.reveal_at}>
        <Choice
          name="reveal_mode"
          value={value.reveal_mode}
          onChange={(v) => set("reveal_mode", v)}
          columns={3}
          options={[
            { value: "live", label: "Straight away", description: "Photos appear as they're taken." },
            { value: "scheduled", label: "At a set time", description: "Like picking up prints the next day." },
            { value: "manual", label: "When I choose", description: "You press reveal from the dashboard." },
          ]}
        />
      </Field>
      {value.reveal_mode === "scheduled" && (
        <Field label="Gallery opens at" htmlFor="reveal_at" hint="Uses your device's time zone.">
          <Input
            id="reveal_at"
            type="datetime-local"
            value={isoToLocalInput(value.reveal_at ?? null)}
            onChange={(e) => set("reveal_at", localInputToIso(e.target.value))}
          />
        </Field>
      )}

      <Field label="Who can see the gallery?">
        <Choice
          name="gallery_visibility"
          value={value.gallery_visibility}
          onChange={(v) => set("gallery_visibility", v)}
          columns={3}
          options={[
            { value: "guests", label: "Guests who joined", description: "Anyone who opened the camera on their phone." },
            { value: "public", label: "Anyone with the link", description: "Good for sharing the gallery afterwards." },
            { value: "private", label: "Only me", description: "Guests shoot but never see the gallery." },
          ]}
        />
      </Field>

      <div className="divide-y divide-line rounded-control border border-line bg-card px-4">
        <Toggle
          checked={value.require_approval}
          onChange={(v) => set("require_approval", v)}
          label="Approve photos before they appear"
          description="New photos wait in your review queue."
        />
        <Toggle
          checked={value.guest_downloads_enabled}
          onChange={(v) => set("guest_downloads_enabled", v)}
          label="Guests can download photos"
          description="Single photos and the whole gallery as ZIP files."
        />
        <Toggle
          checked={value.email_capture_enabled}
          onChange={(v) => set("email_capture_enabled", v)}
          disabled={value.gallery_visibility === "private"}
          label="Email guests when the photos are ready"
          description={
            value.gallery_visibility === "private"
              ? "Not available while the gallery is private."
              : "Guests can leave an email. When the gallery opens, each gets a private link to see and download everything."
          }
        />
        <Toggle
          checked={value.show_guest_names}
          onChange={(v) => set("show_guest_names", v)}
          label="Show who took each photo"
          description="Uses the name each guest entered, if any."
        />
      </div>

      <Field
        label="Access code (optional)"
        htmlFor="access_code"
        hint={
          hasAccessCode
            ? "A code is set. Enter a new one to change it, or clear it below."
            : "Guests must enter this before their camera opens. Useful when the QR code might travel beyond the room."
        }
      >
        <Input
          id="access_code"
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
          maxLength={32}
          autoComplete="off"
          placeholder={hasAccessCode ? "Code set" : "e.g. PARTY26"}
          className="uppercase"
        />
      </Field>
    </div>
  );
}
