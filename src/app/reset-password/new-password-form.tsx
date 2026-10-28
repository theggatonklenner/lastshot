"use client";

import { useActionState } from "react";
import { setNewPassword, type AuthState } from "@/app/auth/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function NewPasswordForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(setNewPassword, undefined);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Type it again" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Button type="submit" size="lg" pending={pending}>
        Save new password
      </Button>
    </form>
  );
}
