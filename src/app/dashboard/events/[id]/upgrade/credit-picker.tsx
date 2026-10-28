"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Notice, Panel } from "@/components/ui";
import { planInfo } from "@/lib/plans";
import type { Plan } from "@/lib/database.types";
import { redeemCredit } from "./actions";

type Credit = { id: string; pack: string; plan: Exclude<Plan, "free">; branding: boolean; remaining: number };

/** Lets an organiser with a bulk pack put one of its events on this event, instead of paying. */
export function CreditPicker({ eventId, credits }: { eventId: string; credits: Credit[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function use(id: string) {
    setError(null);
    start(async () => {
      const res = await redeemCredit(eventId, id);
      if (!res.ok) return setError(res.error);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <Panel className="flex flex-col gap-3 border-cobalt/40 bg-cobalt-soft/40">
      <div>
        <h2 className="text-lg font-bold">Use an event from your pack</h2>
        <p className="text-graphite">No payment needed. The plan applies straight away.</p>
      </div>
      {done && <Notice tone="success">Done. This event now uses one of your pack events.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <ul className="flex flex-col gap-2">
        {credits.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-card px-4 py-3">
            <span>
              <span className="block font-semibold">
                {c.pack === "school" ? "School pack" : `${c.pack}-event pack`}: {planInfo(c.plan).name} plan
                {c.branding ? " with your branding" : ""}
              </span>
              <span className="text-sm text-graphite">
                {c.remaining} {c.remaining === 1 ? "event" : "events"} left
              </span>
            </span>
            <Button type="button" size="sm" onClick={() => use(c.id)} pending={pending}>
              Use on this event
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
