"use client";

import { useState, useTransition } from "react";
import { adminDeleteEvent, adminDeletePhotos, setEventAddons, setEventPlan, suspendEvent, unsuspendEvent } from "@/app/admin/actions";
import { ADDONS, PLANS } from "@/lib/plans";
import { Lightbox } from "@/components/lightbox";
import { Button, EmptyState, Field, Input, Notice, Panel, Select, Toggle, cx } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export function AdminEventControls({
  eventId,
  code,
  suspendedAt,
  suspendedReason,
  plan,
  extraGuests,
  addons,
}: {
  eventId: string;
  code: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  plan: string;
  extraGuests: number;
  addons: Record<"frame" | "branding" | "storage" | "storage1y" | "sms" | "link" | "export" | "setup", boolean>;
}) {
  const [reason, setReason] = useState("");
  const [planChoice, setPlanChoice] = useState(plan);
  const [extra, setExtra] = useState(String(extraGuests));
  const [flags, setFlags] = useState(addons);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok) setError(res.error ?? "That didn't work.");
    });

  return (
    <div className="flex flex-col gap-6">
      <Panel>
        <h2 className="mb-1 text-lg font-bold">Plan</h2>
        <p className="mb-3 text-graphite">Change it without payment, for example to give an event a free upgrade.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Plan" htmlFor="plan">
            <Select id="plan" value={planChoice} onChange={(e) => setPlanChoice(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.guests === null ? "no limit" : `${p.guests} guests`})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Extra seats" htmlFor="extra">
            <Input id="extra" type="number" min={0} className="w-28" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Button
            variant="secondary"
            pending={pending}
            disabled={planChoice === plan && Number(extra) === extraGuests}
            onClick={() => run(() => setEventPlan(eventId, planChoice, Number(extra) || 0))}
          >
            Save plan
          </Button>
        </div>
      </Panel>
      <Panel>
        <h2 className="mb-1 text-lg font-bold">Add-ons</h2>
        <p className="mb-2 text-graphite">Turn add-ons on or off without payment.</p>
        <div className="flex flex-col">
          {ADDONS.map((a) => (
            <Toggle key={a.id} checked={flags[a.id]} onChange={(v) => setFlags((f) => ({ ...f, [a.id]: v }))} label={a.name} />
          ))}
        </div>
        <Button
          variant="secondary"
          className="mt-2"
          pending={pending}
          disabled={JSON.stringify(flags) === JSON.stringify(addons)}
          onClick={() => run(() => setEventAddons(eventId, flags))}
        >
          Save add-ons
        </Button>
      </Panel>
      <Panel>
        <h2 className="mb-1 text-lg font-bold">{suspendedAt ? "Suspended" : "Suspend event"}</h2>
        {suspendedAt ? (
          <div className="flex flex-col gap-3">
            <p className="text-graphite">
              Since {formatDateTime(suspendedAt)}.{suspendedReason ? ` Reason: ${suspendedReason}` : ""} Guests can&apos;t
              join, shoot or see the gallery. The organiser can still see their dashboard.
            </p>
            <Button variant="secondary" pending={pending} onClick={() => run(() => unsuspendEvent(eventId))} className="self-start">
              Lift suspension
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-graphite">Stops guests joining, shooting and viewing. Nothing is deleted.</p>
            <Field label="Reason (shown to the organiser)" htmlFor="reason">
              <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>
            <Button
              variant="danger"
              pending={pending}
              className="self-start"
              onClick={() => window.confirm("Suspend this event now?") && run(() => suspendEvent(eventId, reason))}
            >
              Suspend event
            </Button>
          </div>
        )}
      </Panel>
      <Panel className="border-signal/40">
        <h2 className="mb-1 text-lg font-bold text-signal">Delete event</h2>
        <p className="mb-3 text-graphite">Removes the event, every photo, guest and email address. Can&apos;t be undone.</p>
        <Field label={`Type the event code ${code} to confirm`} htmlFor="confirm-code">
          <Input id="confirm-code" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <Button
          variant="danger"
          className="mt-3"
          pending={pending}
          disabled={confirm.trim() !== code}
          onClick={() => run(() => adminDeleteEvent(eventId, confirm))}
        >
          Delete permanently
        </Button>
      </Panel>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

type AdminPhoto = { id: string; thumb: string; display: string; status: string; flagged: boolean };

export function AdminPhotoGrid({ eventId, photos }: { eventId: string; photos: AdminPhoto[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function remove(ids: string[]) {
    if (!window.confirm(`Delete ${ids.length === 1 ? "this photo" : `${ids.length} photos`} permanently?`)) return;
    start(async () => {
      const res = await adminDeletePhotos(eventId, ids);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      setMessage({ tone: "success", text: `Deleted ${res.data?.deleted ?? 0}.` });
      setSelected(new Set());
      setViewer(null);
    });
  }

  if (!photos.length) return <EmptyState title="No photos" />;

  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Photos (newest 300)</h2>
        <Button variant="danger" size="sm" disabled={!selected.size || pending} onClick={() => remove([...selected])}>
          Delete {selected.size || ""} selected
        </Button>
      </div>
      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {photos.map((p, i) => (
          <li key={p.id} className={cx("relative overflow-hidden rounded-lg border-2", selected.has(p.id) ? "border-signal" : "border-transparent")}>
            <button className="block aspect-square w-full bg-paper-2" onClick={() => setViewer(i)} aria-label="Open photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt="" loading="lazy" className="size-full object-cover" />
            </button>
            <input
              type="checkbox"
              aria-label="Select photo"
              className="absolute top-1.5 left-1.5 size-5 accent-[#c9372c]"
              checked={selected.has(p.id)}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (n.has(p.id)) n.delete(p.id);
                  else n.add(p.id);
                  return n;
                })
              }
            />
            {(p.flagged || p.status !== "approved") && (
              <span className="absolute right-1 bottom-1 rounded bg-ink/80 px-1 text-xs text-paper">
                {p.flagged ? "Flagged" : p.status === "pending" ? "To review" : "Rejected"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {viewer !== null && (
        <Lightbox
          items={photos.map((p) => ({ id: p.id, src: p.display, alt: "Event photo" }))}
          index={viewer}
          onIndex={setViewer}
          onClose={() => setViewer(null)}
          actions={(item) => (
            <button className="h-10 rounded-full bg-signal px-4 font-semibold text-white" disabled={pending} onClick={() => remove([item.id])}>
              Delete
            </button>
          )}
        />
      )}
    </Panel>
  );
}
