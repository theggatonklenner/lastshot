import type { Metadata } from "next";
import Link from "next/link";
import { admin } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { hashToken, isTokenShape } from "@/lib/server/guest";
import { LinkButton, Logo } from "@/components/ui";
import { isPast } from "@/lib/rules";
import { AcceptButton } from "./accept-button";

export const metadata: Metadata = { title: "Join as a co-organiser", robots: { index: false } };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const db = admin();
  const { data: invite } = isTokenShape(token)
    ? await db
        .from("event_invites")
        .select("email, expires_at, accepted_at, event_id, invited_by")
        .eq("token_hash", hashToken(token))
        .maybeSingle()
    : { data: null };
  const [{ data: event }, { data: inviter }, { user }] = await Promise.all([
    invite ? db.from("events").select("title").eq("id", invite.event_id).maybeSingle() : Promise.resolve({ data: null }),
    invite?.invited_by
      ? db.from("profiles").select("display_name, email").eq("id", invite.invited_by).maybeSingle()
      : Promise.resolve({ data: null }),
    getUser(),
  ]);

  const next = `/invite/${token}`;
  let body: React.ReactNode;

  if (!invite || !event) {
    body = (
      <>
        <h1 className="display-md text-4xl">Invite not found</h1>
        <p className="text-graphite">This invite link isn&apos;t valid. It may have been cancelled. Ask the organiser to send a new one.</p>
      </>
    );
  } else if (invite.accepted_at) {
    body = (
      <>
        <h1 className="display-md text-4xl">Already accepted</h1>
        <p className="text-graphite">This invite has been used.</p>
        <LinkButton href="/dashboard" className="self-start">Go to your events</LinkButton>
      </>
    );
  } else if (isPast(invite.expires_at)) {
    body = (
      <>
        <h1 className="display-md text-4xl">Invite expired</h1>
        <p className="text-graphite">Invites last 14 days. Ask the organiser of {event.title} to send a new one.</p>
      </>
    );
  } else {
    const from = inviter?.display_name || inviter?.email || "An organiser";
    const signedInRight = user && user.email?.toLowerCase() === invite.email;
    body = (
      <>
        <h1 className="display-md text-4xl">Help run {event.title}</h1>
        <p className="text-graphite">
          {from} invited <strong className="text-ink">{invite.email}</strong> to be a co-organiser. You&apos;ll be able to
          see and moderate photos, manage guests and change settings.
        </p>
        {signedInRight ? (
          <AcceptButton token={token} />
        ) : user ? (
          <p className="rounded-control bg-flash/30 px-4 py-3">
            You&apos;re signed in as {user.email}. Sign out and sign in as {invite.email} to accept.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/login?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}>
              Sign in to accept
            </LinkButton>
            <LinkButton
              href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`}
              variant="secondary"
            >
              Create an account
            </LinkButton>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-5 py-10">
      <Link href="/" aria-label="Lastshot home" className="self-start">
        <Logo />
      </Link>
      {body}
    </main>
  );
}
