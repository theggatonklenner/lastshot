"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { startAddonCheckout, type CheckoutState } from "./actions";

export function AddonButton({ eventId, addon, label, disabled }: { eventId: string; addon: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startAddonCheckout, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="addon" value={addon} />
      <Button type="submit" variant="secondary" disabled={disabled || pending} className="w-full">
        {pending ? "Opening checkout…" : label}
      </Button>
      {state?.error && <p className="text-sm text-signal">{state.error}</p>}
    </form>
  );
}
