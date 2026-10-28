"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/auth/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);

  if (state?.notice) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">{state.notice}</Notice>
        <p className="text-graphite">Check your spam folder if it doesn&apos;t arrive in a few minutes.</p>
        <Link href="/login" className="font-semibold text-cobalt hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required defaultValue={state?.email} />
      </Field>
      <Button type="submit" size="lg" pending={pending}>
        Send reset link
      </Button>
      <Link href="/login" className="text-[15px] font-semibold text-cobalt hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
