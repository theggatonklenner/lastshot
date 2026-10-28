"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EVENT_DEFAULTS, EventInput, type EventInputType } from "@/lib/event-schema";
import { changeLifecycle, createEvent, setAccessCode as saveAccessCode, updateEvent } from "@/app/dashboard/actions";
import { BasicsFields, GalleryFields, RollFields } from "@/components/event-fields";
import { CoverPicker } from "@/components/cover-picker";
import { Button, Notice, cx } from "@/components/ui";
import { formatEventDate, formatDateTime } from "@/lib/format";
import { eventTypeLabel } from "@/lib/rules";
import { THEMES } from "@/lib/themes";

const STEPS = ["Basics", "The roll", "Gallery", "Cover", "Review"] as const;

export function Wizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [value, setValue] = useState<EventInputType>(() => ({
    ...EVENT_DEFAULTS,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Australia/Sydney",
  }));
  const [accessCode, setAccessCode] = useState("");
  const [eventId, setEventId] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof EventInputType, string>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const set = <K extends keyof EventInputType>(key: K, v: EventInputType[K]) => {
    setValue((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validateStep(): boolean {
    const next: typeof errors = {};
    if (step === 0 && !value.title.trim()) next.title = "Give the event a name.";
    if (step === 1 && !(value.photos_per_guest >= 1 && value.photos_per_guest <= 100)) {
      next.photos_per_guest = "Choose between 1 and 100 shots.";
    }
    if (step === 2 && value.reveal_mode === "scheduled" && !value.reveal_at) next.reveal_at = "Pick when the gallery opens.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  /** Saves the draft so far. Creates it the first time. */
  async function save(): Promise<string | null> {
    const parsed = EventInput.safeParse(value);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "Check the details.");
      return null;
    }
    if (!eventId) {
      const res = await createEvent(parsed.data, accessCode || null);
      if (!res.ok) {
        setMessage(res.error);
        return null;
      }
      setEventId(res.data!.id);
      setSavedCode(accessCode || null);
      return res.data!.id;
    }
    const res = await updateEvent(eventId, parsed.data);
    if (!res.ok) {
      setMessage(res.error);
      return null;
    }
    if ((accessCode || null) !== savedCode) {
      const codeRes = await saveAccessCode(eventId, accessCode || null);
      if (!codeRes.ok) {
        setMessage(codeRes.error);
        return null;
      }
      setSavedCode(accessCode || null);
    }
    return eventId;
  }

  function next() {
    if (!validateStep()) return;
    setMessage(null);
    start(async () => {
      // Save from step 1 onwards so nothing is lost if the tab closes.
      const id = await save();
      if (id) setStep((s) => Math.min(s + 1, STEPS.length - 1));
    });
  }

  function saveDraft() {
    start(async () => {
      const id = await save();
      if (id) router.push(`/dashboard/events/${id}`);
    });
  }

  function publish() {
    start(async () => {
      const id = await save();
      if (!id) return;
      const res = await changeLifecycle(id, "publish");
      if (!res.ok) {
        setMessage(res.error);
        return;
      }
      router.push(`/dashboard/events/${id}/share?published=1`);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link href="/dashboard" className="text-[15px] font-semibold text-graphite hover:text-ink">
          Back to your events
        </Link>
        <h1 className="display-md text-4xl">New event</h1>
        <ol className="flex gap-1.5" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex-1">
              <button
                type="button"
                disabled={i > step || pending}
                onClick={() => setStep(i)}
                className="flex w-full flex-col gap-1.5 text-left disabled:cursor-default"
                aria-current={i === step ? "step" : undefined}
              >
                <span className={cx("h-1.5 rounded-full", i <= step ? "bg-cobalt" : "bg-line")} />
                <span className={cx("hidden text-sm sm:block", i === step ? "font-semibold text-ink" : "text-graphite")}>
                  {label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <p className="text-sm text-graphite sm:hidden">
          Step {step + 1} of {STEPS.length}: {STEPS[step]}
        </p>
      </div>

      {message && <Notice tone="error">{message}</Notice>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (step < STEPS.length - 1) next();
          else publish();
        }}
        className="flex flex-col gap-8"
      >
        {step === 0 && <BasicsFields value={value} set={set} errors={errors} />}
        {step === 1 && <RollFields value={value} set={set} errors={errors} />}
        {step === 2 && (
          <GalleryFields
            value={value}
            set={set}
            errors={errors}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
          />
        )}
        {step === 3 && eventId && (
          <div className="flex flex-col gap-3">
            <p className="text-graphite">
              Guests see this when they scan the code. A wide photo of the venue or the people being celebrated works
              well. You can skip this.
            </p>
            <CoverPicker eventId={eventId} initialUrl={null} accent={value.theme === "custom" ? value.accent_color : "#2546d8"} />
          </div>
        )}
        {step === 4 && <Review value={value} hasCode={!!accessCode} />}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={pending}>
                Back
              </Button>
            )}
            {eventId && (
              <Button type="button" variant="secondary" onClick={saveDraft} disabled={pending}>
                Save draft
              </Button>
            )}
          </div>
          {step < STEPS.length - 1 ? (
            <Button type="submit" pending={pending}>
              {step === 3 ? "Continue to review" : "Continue"}
            </Button>
          ) : (
            <Button type="submit" pending={pending}>
              Publish event
            </Button>
          )}
        </div>
        {step === STEPS.length - 1 && eventId && (
          <p className="text-sm text-graphite">
            Want to see it first?{" "}
            <Link href={`/dashboard/events/${eventId}/preview`} className="font-semibold text-cobalt hover:underline">
              Preview the guest page
            </Link>{" "}
            (saves the draft).
          </p>
        )}
      </form>
    </div>
  );
}

function Review({ value, hasCode }: { value: EventInputType; hasCode: boolean }) {
  const reveal =
    value.reveal_mode === "live"
      ? "Straight away"
      : value.reveal_mode === "scheduled"
        ? `At ${formatDateTime(value.reveal_at ?? null)}`
        : "When you choose";
  const visibility = { guests: "Guests who joined", public: "Anyone with the link", private: "Only you" }[
    value.gallery_visibility
  ];
  const rows: [string, string][] = [
    ["Event", `${value.title} (${eventTypeLabel(value.event_type)})`],
    ["Date", formatEventDate(value.event_date ?? null, value.start_time, value.end_time)],
    ["Shots per guest", String(value.photos_per_guest)],
    ["Camera style", THEMES[value.theme].name],
    ["Gallery opens", reveal],
    ["Who sees the gallery", visibility],
    ["Approval", value.require_approval ? "You approve each photo" : "Photos go straight in"],
    ["Downloads", value.guest_downloads_enabled ? "Guests can download" : "Only you can download"],
    ["Camera roll", value.camera_roll_uploads_enabled ? "Allowed" : "Camera only"],
    ["Access code", hasCode ? "Required" : "None"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-graphite">
        Publishing creates the QR code and lets guests join. Everything here can still be changed afterwards.
      </p>
      <dl className="divide-y divide-line rounded-panel border border-line bg-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-6">
            <dt className="text-graphite">{k}</dt>
            <dd className="font-semibold sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
