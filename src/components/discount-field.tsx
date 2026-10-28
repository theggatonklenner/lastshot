"use client";

import { useState, useTransition } from "react";
import { checkDiscountCode } from "@/app/dashboard/events/[id]/upgrade/actions";
import { cx } from "@/components/ui";

export type AppliedDiscount = { code: string | null; percent: number; label: string };

/**
 * "Have a code?" box for order summaries. A standing venue discount (no code)
 * shows as applied without a remove button. The server checks the code again
 * when it prices the order.
 */
export function DiscountField({
  eventId,
  applied,
  setApplied,
  standing,
}: {
  eventId: string | null;
  applied: AppliedDiscount | null;
  setApplied: (d: AppliedDiscount | null) => void;
  /** Discount that applies without a code (from a venue), if any. */
  standing?: AppliedDiscount | null;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function apply() {
    const c = code.trim();
    if (!c) return;
    setError(null);
    start(async () => {
      const res = await checkDiscountCode(eventId, c);
      if (!res.ok) return setError(res.error);
      setApplied({ code: res.code, percent: res.percent, label: res.label });
      setOpen(false);
      setCode("");
    });
  }

  if (applied) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-control bg-ok-soft px-3 py-2.5 text-ok">
        <span className="min-w-0 text-sm">
          <span className="block font-bold">
            {applied.percent}% off{applied.code ? ` with ${applied.code}` : ""}
          </span>
          <span className="block">{applied.label}</span>
        </span>
        {applied.code && (
          <button
            type="button"
            onClick={() => setApplied(standing ?? null)}
            className="shrink-0 text-sm font-semibold underline"
          >
            Remove
          </button>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="self-start text-sm font-semibold text-cobalt hover:underline">
        Have a discount code?
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="discount-code" className="text-sm font-semibold">
        Discount code
      </label>
      <div className="flex gap-2">
        <input
          id="discount-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          placeholder="FRIEND-ABC123"
          className={cx(
            "min-w-0 flex-1 rounded-control border bg-card px-3 py-2 font-mono text-[15px] uppercase outline-none focus:border-cobalt",
            error ? "border-signal" : "border-line",
          )}
        />
        <button
          type="button"
          onClick={apply}
          disabled={pending || !code.trim()}
          className="shrink-0 rounded-control border border-line px-3 py-2 text-sm font-semibold hover:border-ink/30 disabled:opacity-50"
        >
          {pending ? "Checking" : "Apply"}
        </button>
      </div>
      {error && <p className="text-sm text-signal">{error}</p>}
    </div>
  );
}
