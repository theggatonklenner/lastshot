"use client";

import { useState, useTransition } from "react";
import { setKeepPhotos } from "@/app/dashboard/actions";
import { Notice, Toggle } from "@/components/ui";

const fmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" });

export function KeepPhotos({
  eventId,
  keep,
  deleteAfter,
  ended,
}: {
  eventId: string;
  keep: boolean;
  /** ISO date photos will be deleted, computed on the server; null when kept. */
  deleteAfter: string | null;
  ended: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const description = keep
    ? "Photos stay until you delete them or the event."
    : ended && deleteAfter
      ? `Photos will be deleted automatically on ${fmt.format(new Date(deleteAfter))}. You'll get an email two weeks before.`
      : "Photos are deleted automatically 180 days after the event ends. You'll get an email two weeks before.";

  return (
    <div className="flex flex-col gap-2">
      <Toggle
        checked={keep}
        disabled={pending}
        onChange={(v) =>
          start(async () => {
            setError(null);
            const res = await setKeepPhotos(eventId, v);
            if (!res.ok) setError(res.error);
          })
        }
        label="Keep photos after 180 days"
        description={description}
      />
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
