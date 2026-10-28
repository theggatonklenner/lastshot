"use client";

import { useTransition } from "react";
import { setGuestBlocked } from "@/app/dashboard/actions";
import { Button } from "@/components/ui";

export function BlockButton({ eventId, guestId, blocked }: { eventId: string; guestId: string; blocked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant={blocked ? "secondary" : "ghost"}
      pending={pending}
      onClick={() => {
        if (!blocked && !window.confirm("Block this camera? It won't be able to take or upload more photos.")) return;
        start(async () => {
          const res = await setGuestBlocked(eventId, guestId, !blocked);
          if (!res.ok) window.alert(res.error);
        });
      }}
    >
      {blocked ? "Unblock" : "Block"}
    </Button>
  );
}
