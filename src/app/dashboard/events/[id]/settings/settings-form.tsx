"use client";

import { useState, useTransition } from "react";
import { deleteEvent, setAccessCode as saveAccessCode, updateEvent } from "@/app/dashboard/actions";
import { BasicsFields, GalleryFields, RollFields } from "@/components/event-fields";
import { CoverPicker } from "@/components/cover-picker";
import { Button, Field, Input, Notice, Panel } from "@/components/ui";
import { EventInput, type EventInputType } from "@/lib/event-schema";
import type { EventRecord } from "@/lib/database.types";

function toInput(e: EventRecord): EventInputType {
  return {
    title: e.title,
    description: e.description,
    event_type: e.event_type,
    event_date: e.event_date,
    timezone: e.timezone,
    start_time: e.start_time?.slice(0, 5) ?? null,
    end_time: e.end_time?.slice(0, 5) ?? null,
    photos_per_guest: e.photos_per_guest,
    bonus_shots: e.bonus_shots,
    bonus_at: e.bonus_at,
    mystery_at: e.mystery_at,
    mystery_prompt: e.mystery_prompt,
    reveal_mode: e.reveal_mode,
    reveal_at: e.reveal_at,
    gallery_visibility: e.gallery_visibility,
    guest_downloads_enabled: e.guest_downloads_enabled,
    camera_roll_uploads_enabled: e.camera_roll_uploads_enabled,
    require_approval: e.require_approval,
    show_guest_names: e.show_guest_names,
    date_stamp_enabled: e.date_stamp_enabled,
    email_capture_enabled: e.email_capture_enabled,
    theme: e.theme as EventInputType["theme"],
    accent_color: e.accent_color,
  };
}

export function SettingsForm({
  event,
  coverUrl,
  isOwner,
}: {
  event: EventRecord;
  coverUrl: string | null;
  isOwner: boolean;
}) {
  const [value, setValue] = useState<EventInputType>(() => toInput(event));
  const [accessCode, setAccessCode] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [confirmTitle, setConfirmTitle] = useState("");
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const set = <K extends keyof EventInputType>(key: K, v: EventInputType[K]) => setValue((p) => ({ ...p, [key]: v }));

  function save() {
    setMessage(null);
    const parsed = EventInput.safeParse(value);
    if (!parsed.success) {
      setMessage({ tone: "error", text: parsed.error.issues[0]?.message ?? "Check the details." });
      return;
    }
    start(async () => {
      const res = await updateEvent(event.id, parsed.data);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      if (accessCode) {
        const codeRes = await saveAccessCode(event.id, accessCode);
        if (!codeRes.ok) return setMessage({ tone: "error", text: codeRes.error });
        setAccessCode("");
      }
      setMessage({ tone: "success", text: "Settings saved. Photos already taken are unchanged." });
    });
  }

  function clearCode() {
    start(async () => {
      const res = await saveAccessCode(event.id, null);
      setMessage(res.ok ? { tone: "success", text: "Access code removed." } : { tone: "error", text: res.error });
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Panel>
          <h2 className="mb-5 text-xl font-bold">Event details</h2>
          <BasicsFields value={value} set={set} />
        </Panel>
        <Panel>
          <h2 className="mb-5 text-xl font-bold">Cover image</h2>
          <CoverPicker eventId={event.id} initialUrl={coverUrl} accent={value.accent_color} />
        </Panel>
        <Panel>
          <h2 className="mb-1 text-xl font-bold">The camera</h2>
          <p className="mb-5 text-graphite">
            Changing the shot limit applies from now on. A guest who already used more than the new limit simply has no
            shots left; none of their photos are removed.
          </p>
          <RollFields value={value} set={set} />
        </Panel>
        <Panel>
          <h2 className="mb-5 text-xl font-bold">Gallery and privacy</h2>
          <GalleryFields
            value={value}
            set={set}
            accessCode={accessCode}
            setAccessCode={setAccessCode}
            hasAccessCode={!!event.access_code_hash}
          />
          {event.access_code_hash && (
            <Button type="button" variant="ghost" size="sm" className="mt-3" onClick={clearCode} disabled={pending}>
              Remove access code
            </Button>
          )}
        </Panel>

        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-line bg-paper/95 px-4 py-4 backdrop-blur sm:mx-0">
          {message && <Notice tone={message.tone}>{message.text}</Notice>}
          <Button type="submit" pending={pending} className="self-start">
            Save settings
          </Button>
        </div>
      </form>

      {isOwner && (
      <Panel className="border-signal/40">
        <h2 className="mb-1 text-xl font-bold text-signal">Delete event</h2>
        <p className="mb-5 text-graphite">
          Permanently deletes the event, every photo and every guest record. Guests lose access straight away. This
          can&apos;t be undone, so download anything you want to keep first.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setDeleteError(null);
            startDelete(async () => {
              const res = await deleteEvent(event.id, confirmTitle);
              if (res && !res.ok) setDeleteError(res.error);
            });
          }}
        >
          <Field label={`Type "${event.title}" to confirm`} htmlFor="confirm-title" error={deleteError}>
            <Input id="confirm-title" value={confirmTitle} onChange={(e) => setConfirmTitle(e.target.value)} autoComplete="off" />
          </Field>
          <Button type="submit" variant="danger" pending={deleting} disabled={confirmTitle.trim() !== event.title.trim()} className="self-start">
            Delete event and photos
          </Button>
        </form>
      </Panel>
      )}
    </div>
  );
}
