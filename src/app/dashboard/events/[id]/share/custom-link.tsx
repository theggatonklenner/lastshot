"use client";

import { useState, useTransition } from "react";
import { Button, Notice, Panel } from "@/components/ui";
import { normaliseSlug, slugProblem } from "@/lib/plans";
import { setCustomSlug } from "./actions";

/** Choose the event's short link, e.g. lastshot.app/sam-and-alex. */
export function CustomLink({ eventId, host, initial }: { eventId: string; host: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const slug = normaliseSlug(value);
  const local = value.trim() ? slugProblem(slug) : null;

  function save(next: string) {
    setError(null);
    start(async () => {
      const res = await setCustomSlug(eventId, next);
      if (!res.ok) return setError(res.error);
      setSaved(res.slug);
      setValue(res.slug ?? "");
    });
  }

  return (
    <Panel id="custom-link" className="scroll-mt-24">
      <h2 className="mb-2 text-lg font-bold">Custom link</h2>
      <p className="mb-4 text-graphite">
        An easy link for invites and signs. The QR code switches to it once it&apos;s saved, and the old link keeps working.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!local) save(value);
        }}
        className="flex flex-col gap-3"
      >
        <label htmlFor="slug" className="sr-only">
          Custom link
        </label>
        <div className="flex min-w-0 items-center overflow-hidden rounded-control border border-line bg-card focus-within:border-cobalt">
          <span className="shrink-0 pl-3 text-graphite">{host}/</span>
          <input
            id="slug"
            value={value}
            onChange={(e) => setValue(e.target.value.toLowerCase())}
            maxLength={40}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            placeholder="sam-and-alex"
            className="min-w-0 flex-1 bg-transparent py-2 pr-3 outline-none"
          />
        </div>
        {value && slug !== value.trim() && !local && <p className="text-sm text-graphite">Will be saved as {host}/{slug}</p>}
        {(local || error) && <p className="text-sm text-signal">{local ?? error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" pending={pending} disabled={!!local || !value.trim() || slug === saved}>
            Save link
          </Button>
          {saved && (
            <Button type="button" variant="ghost" onClick={() => save("")} disabled={pending}>
              Remove
            </Button>
          )}
        </div>
        {saved && !error && (
          <Notice tone="success">
            Live at {host}/{saved}
          </Notice>
        )}
      </form>
    </Panel>
  );
}
