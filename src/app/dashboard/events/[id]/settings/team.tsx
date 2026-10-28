"use client";

import { useState, useTransition } from "react";
import { cancelInvite, inviteCoOrganiser, leaveEvent, removeCoOrganiser } from "@/app/dashboard/team-actions";
import { Button, Field, Input, Notice, Panel } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

export type TeamPerson = { id: string; name: string | null; email: string; role: "owner" | "co" };
export type TeamInvite = { id: string; email: string; expired: boolean };

export function TeamPanel({
  eventId,
  isOwner,
  people,
  invites,
}: {
  eventId: string;
  isOwner: boolean;
  people: TeamPerson[];
  invites: TeamInvite[];
}) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; link?: string } | null>(null);

  function invite(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await inviteCoOrganiser(eventId, email);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      setEmail("");
      setMessage(
        res.data?.emailed
          ? { tone: "success", text: "Invite sent." }
          : {
              tone: "success",
              text: "Invite created, but the email couldn't be sent. Send them this link yourself:",
              link: res.data?.link,
            },
      );
    });
  }

  return (
    <Panel className="max-w-3xl">
      <h2 className="mb-1 text-xl font-bold">Team</h2>
      <p className="mb-5 text-graphite">
        Co-organisers can moderate photos, manage guests and change settings. Only the creator can delete the event or
        change the team.
      </p>

      <ul className="divide-y divide-line rounded-control border border-line">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{p.name || p.email}</span>
              <span className="block truncate text-sm text-graphite">
                {p.name ? `${p.email}, ` : ""}
                {p.role === "owner" ? "Creator" : "Co-organiser"}
              </span>
            </span>
            {isOwner && p.role === "co" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  window.confirm(`Remove ${p.email} from this event?`) &&
                  start(async () => {
                    const res = await removeCoOrganiser(eventId, p.id);
                    if (!res.ok) setMessage({ tone: "error", text: res.error });
                  })
                }
              >
                Remove
              </Button>
            )}
          </li>
        ))}
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{i.email}</span>
              <span className="block text-sm text-graphite">{i.expired ? "Invite expired" : "Invited, waiting to accept"}</span>
            </span>
            {isOwner && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await cancelInvite(eventId, i.id);
                    if (!res.ok) setMessage({ tone: "error", text: res.error });
                  })
                }
              >
                Cancel invite
              </Button>
            )}
          </li>
        ))}
      </ul>

      {message && (
        <div className="mt-4 flex flex-col gap-2">
          <Notice tone={message.tone}>{message.text}</Notice>
          {message.link && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-paper-2 px-2 py-1 text-sm">{message.link}</code>
              <CopyButton text={message.link} label="Copy link" />
            </div>
          )}
        </div>
      )}

      {isOwner ? (
        <form onSubmit={invite} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Invite a co-organiser" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="their@email.com"
              />
            </Field>
          </div>
          <Button type="submit" pending={pending} disabled={!email.trim()}>
            Send invite
          </Button>
        </form>
      ) : (
        <Button
          variant="secondary"
          className="mt-5"
          disabled={pending}
          onClick={() =>
            window.confirm("Leave this event? You'll lose access until you're invited again.") &&
            start(async () => {
              const res = await leaveEvent(eventId);
              if (res && !res.ok) setMessage({ tone: "error", text: res.error });
            })
          }
        >
          Leave this event
        </Button>
      )}
    </Panel>
  );
}
