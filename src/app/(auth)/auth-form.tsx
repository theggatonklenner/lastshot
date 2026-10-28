"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, type AuthState } from "@/app/auth/actions";
import { Button, Field, Input, Notice } from "@/components/ui";

export function AuthForm({ mode, next, linkError }: { mode: "login" | "signup"; next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const isLogin = mode === "login";

  if (state?.notice) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success">{state.notice}</Notice>
        <p className="text-graphite">
          We sent it to <strong className="text-ink">{state.email}</strong>.
        </p>
        <Link href="/login" className="font-semibold text-cobalt underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {linkError && !state && <Notice tone="error">That link has expired or was already used. Sign in or request a new one.</Notice>}
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      {!isLogin && (
        <Field label="Your name" htmlFor="displayName" hint="Shown only to you in the dashboard.">
          <Input id="displayName" name="displayName" autoComplete="name" maxLength={80} />
        </Field>
      )}
      <Field label="Email" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state?.email}
          inputMode="email"
        />
      </Field>
      <Field label="Password" htmlFor="password" hint={isLogin ? undefined : "At least 8 characters."}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          minLength={8}
        />
      </Field>
      <Button type="submit" size="lg" pending={pending}>
        {isLogin ? "Sign in" : "Create account"}
      </Button>
      <p className="text-[15px] text-graphite">
        {isLogin ? (
          <>
            New here?{" "}
            <Link href="/signup" className="font-semibold text-cobalt hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-cobalt hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
