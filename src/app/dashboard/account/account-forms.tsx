"use client";

import { useActionState } from "react";
import { changeEmail, changePassword, deleteMyAccount, saveName, type AccountState } from "./actions";
import { Button, Field, Input, Notice, Panel } from "@/components/ui";

function Status({ state }: { state: AccountState }) {
  if (state?.error) return <Notice tone="error">{state.error}</Notice>;
  if (state?.notice) return <Notice tone="success">{state.notice}</Notice>;
  return null;
}

export function AccountForms({ email, displayName, ownedEvents }: { email: string; displayName: string; ownedEvents: number }) {
  const [nameState, nameAction, namePending] = useActionState(saveName, undefined);
  const [emailState, emailAction, emailPending] = useActionState(changeEmail, undefined);
  const [pwState, pwAction, pwPending] = useActionState(changePassword, undefined);
  const [delState, delAction, delPending] = useActionState(deleteMyAccount, undefined);

  return (
    <>
      <Panel>
        <h2 className="mb-4 text-xl font-bold">Your name</h2>
        <form action={nameAction} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="displayName" hint="Shown to co-organisers on events you share.">
            <Input id="displayName" name="displayName" defaultValue={displayName} maxLength={80} autoComplete="name" />
          </Field>
          <Status state={nameState} />
          <Button type="submit" pending={namePending} className="self-start">
            Save name
          </Button>
        </form>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-xl font-bold">Email</h2>
        <p className="mb-4 text-graphite">Currently {email}.</p>
        <form action={emailAction} className="flex flex-col gap-4">
          <Field label="New email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </Field>
          <Status state={emailState} />
          <Button type="submit" variant="secondary" pending={emailPending} className="self-start">
            Change email
          </Button>
        </form>
      </Panel>

      <Panel>
        <h2 className="mb-4 text-xl font-bold">Password</h2>
        <form action={pwAction} className="flex flex-col gap-4">
          <Field label="Current password" htmlFor="current">
            <Input id="current" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Type the new password again" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Status state={pwState} />
          <Button type="submit" variant="secondary" pending={pwPending} className="self-start">
            Change password
          </Button>
        </form>
      </Panel>

      <Panel className="border-signal/40">
        <h2 className="mb-1 text-xl font-bold text-signal">Delete account</h2>
        <p className="mb-4 text-graphite">
          Permanently deletes your account
          {ownedEvents > 0 ? ` and the ${ownedEvents === 1 ? "event" : `${ownedEvents} events`} you created, with every photo` : ""}.
          Events you co-organise for someone else aren&apos;t affected. This can&apos;t be undone.
        </p>
        <form action={delAction} className="flex flex-col gap-4">
          <Field label={`Type ${email} to confirm`} htmlFor="confirmEmail">
            <Input id="confirmEmail" name="confirmEmail" autoComplete="off" required />
          </Field>
          <Status state={delState} />
          <Button type="submit" variant="danger" pending={delPending} className="self-start">
            Delete my account
          </Button>
        </form>
      </Panel>
    </>
  );
}
