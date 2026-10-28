"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { startCheckout, type CheckoutState } from "./actions";

export function PlanButton({ eventId, plan, label, disabled }: { eventId: string; plan: string; label: string; disabled?: boolean }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, undefined);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="plan" value={plan} />
      <Button type="submit" disabled={disabled || pending} className="w-full">
        {pending ? "Opening checkout…" : label}
      </Button>
      {state?.error && <p className="text-sm text-signal">{state.error}</p>}
    </form>
  );
}
