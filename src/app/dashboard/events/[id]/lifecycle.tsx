"use client";

import { useState, useTransition } from "react";
import { changeLifecycle } from "@/app/dashboard/actions";
import { Button, Notice } from "@/components/ui";
import type { EventRecord } from "@/lib/database.types";

type Action = Parameters<typeof changeLifecycle>[1];

export function LifecycleActions({
  event,
  revealed,
}: {
  event: Pick<EventRecord, "id" | "status" | "submissions_closed_at" | "reveal_mode" | "revealed_at" | "reveal_at">;
  /** Computed on the server so render stays pure. */
  revealed: boolean;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (action: Action, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(action);
    setError(null);
    start(async () => {
      const res = await changeLifecycle(event.id, action);
      if (!res.ok) setError(res.error);
      setBusy(null);
    });
  };

  const btn = (action: Action, label: string, variant: "primary" | "secondary" | "danger" | "flash" = "secondary", confirmText?: string) => (
    <Button
      key={action}
      variant={variant}
      size="sm"
      pending={pending && busy === action}
      disabled={pending}
      onClick={() => run(action, confirmText)}
    >
      {label}
    </Button>
  );

  const s = event.status;
  const shooting = s === "published" || s === "active";

  const actions = [
    s === "draft" && btn("publish", "Publish event", "primary"),
    s === "published" && btn("unpublish", "Back to draft"),
    shooting && !event.submissions_closed_at && btn("close", "Pause new photos"),
    shooting && event.submissions_closed_at && btn("open", "Resume new photos", "primary"),
    shooting && btn("end", "End event", "secondary", "End the event? Guests won't be able to take more photos. You can reopen it later."),
    s === "ended" && btn("reopen", "Reopen event"),
    s === "ended" && btn("archive", "Archive"),
    s === "archived" && btn("unarchive", "Unarchive"),
    s !== "draft" && !revealed && btn("reveal", "Reveal gallery now", "flash", "Open the gallery to guests now?"),
    s !== "draft" && event.reveal_mode === "manual" && event.revealed_at && btn("unreveal", "Hide gallery"),
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
