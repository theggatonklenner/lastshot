"use client";

import { useEffect, useRef, useState } from "react";
import { guestToken } from "@/lib/client/upload-queue";
import { cx } from "@/components/ui";

const REASONS = [
  { value: "privacy", label: "I'm in it and want it removed" },
  { value: "inappropriate", label: "It's inappropriate or offensive" },
  { value: "other", label: "Something else" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

export function ReportDialog({
  code,
  photoId,
  onClose,
  onReported,
}: {
  code: string;
  photoId: string;
  onClose: () => void;
  onReported: (hidden: boolean) => void;
}) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason) return setError("Choose a reason.");
    setBusy(true);
    setError(null);
    const token = guestToken(code);
    const res = await fetch(`/api/e/${code}/report`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-lastshot-guest": token } : {}) },
      body: JSON.stringify({ photoId, reason, details: details || null }),
    }).catch(() => null);
    setBusy(false);
    const json = await res?.json().catch(() => ({}));
    if (!res?.ok) return setError(json?.message ?? "The report didn't send. Try again.");
    setDone(true);
    onReported(!!json.hidden);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-t-[22px] bg-body-2 p-5 pb-[max(20px,env(safe-area-inset-bottom))] text-cream sm:rounded-[22px]"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <div className="flex flex-col gap-4">
            <h2 id="report-title" className="display-md text-2xl">Thanks for telling us</h2>
            <p className="text-cream-dim">The organiser has been told and will review this photo.</p>
            <button onClick={onClose} className="h-12 rounded-full bg-cream font-bold text-body">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <h2 id="report-title" className="display-md text-2xl">Report this photo</h2>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Reason</legend>
              {REASONS.map((r, i) => (
                <label
                  key={r.value}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-[12px] border px-4 py-3",
                    reason === r.value ? "border-flash bg-cream/5" : "border-cream/15",
                  )}
                >
                  <input
                    ref={i === 0 ? first : undefined}
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="size-4 accent-[#ffd23f]"
                  />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-1.5 text-[15px]">
              <span className="text-cream-dim">Anything else the organiser should know? (optional)</span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                maxLength={300}
                rows={2}
                className="rounded-[12px] border border-cream/15 bg-body px-3 py-2 text-cream focus:border-flash focus:outline-none"
              />
            </label>
            {error && (
              <p role="alert" className="text-flash">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="h-12 flex-1 rounded-full bg-cream/10 font-semibold">
                Cancel
              </button>
              <button disabled={busy} className="h-12 flex-1 rounded-full bg-flash font-bold text-body disabled:opacity-50">
                {busy ? "Sending" : "Send report"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
