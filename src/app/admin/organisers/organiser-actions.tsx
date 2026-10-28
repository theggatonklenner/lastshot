"use client";

import { useTransition } from "react";
import { deleteOrganiser, setAdminFlag } from "@/app/admin/actions";
import { Button } from "@/components/ui";

export function OrganiserActions({ userId, email, isAdmin, events }: { userId: string; email: string; isAdmin: boolean; events: number }) {
  const [pending, start] = useTransition();

  const toggleAdmin = () => {
    const msg = isAdmin ? `Remove admin access from ${email}?` : `Give ${email} full admin access to every event?`;
    if (!window.confirm(msg)) return;
    start(async () => {
      const res = await setAdminFlag(userId, !isAdmin);
      if (!res.ok) window.alert(res.error);
    });
  };

  const remove = () => {
    const typed = window.prompt(
      `This deletes ${email}, their ${events === 1 ? "event" : `${events} events`} and every photo. Type their email to confirm.`,
    );
    if (typed === null) return;
    start(async () => {
      const res = await deleteOrganiser(userId, typed);
      if (!res.ok) window.alert(res.error);
    });
  };

  return (
    <div className="flex justify-end gap-1">
      <Button size="sm" variant="ghost" disabled={pending} onClick={toggleAdmin}>
        {isAdmin ? "Remove admin" : "Make admin"}
      </Button>
      <Button size="sm" variant="ghost" className="text-signal" disabled={pending} onClick={remove}>
        Delete
      </Button>
    </div>
  );
}
