"use client";

import { useState, useTransition } from "react";
import { acceptInvite } from "@/app/dashboard/team-actions";
import { Button, Notice } from "@/components/ui";

export function AcceptButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        size="lg"
        pending={pending}
        className="self-start"
        onClick={() =>
          start(async () => {
            const res = await acceptInvite(token);
            if (res && !res.ok) setError(res.error);
          })
        }
      >
        Accept invite
      </Button>
    </div>
  );
}
