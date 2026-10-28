import type { Metadata } from "next";
import { admin } from "@/lib/supabase/admin";
import { EVENT_CODE_RE, hashToken, isTokenShape } from "@/lib/server/guest";
import { GuestMessage, guestButton } from "@/components/guest/guest-shell";
import { unsubscribe } from "./actions";

export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false } };

/**
 * Two-step on purpose: mail scanners open links automatically, so unsubscribing
 * needs a button press rather than happening on page load.
 */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/e/[code]/unsubscribe/[token]">) {
  const { code, token } = await params;
  const sp = await searchParams;
  const valid = EVENT_CODE_RE.test(code) && isTokenShape(token);
  const { data: event } = valid
    ? await admin().from("events").select("id, title").eq("code", code).maybeSingle()
    : { data: null };
  const { data: row } = event
    ? await admin()
        .from("guest_emails")
        .select("email, unsubscribed_at")
        .eq("event_id", event.id)
        .eq("view_token_hash", hashToken(token))
        .maybeSingle()
    : { data: null };

  if (!event || !row) {
    return <GuestMessage title="Link not recognised">This unsubscribe link doesn&apos;t match an email address. Check you used the whole link from the email, or ask the event organiser to remove you.</GuestMessage>;
  }

  const title = event.title;
  if (row.unsubscribed_at || sp.done) {
    return (
      <GuestMessage title="You're unsubscribed">
        {row.email} won&apos;t get any more emails about {title}.
      </GuestMessage>
    );
  }

  return (
    <GuestMessage
      title="Unsubscribe?"
      action={
        <form action={unsubscribe} className="w-full">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="token" value={token} />
          <button className={guestButton}>Unsubscribe {row.email}</button>
        </form>
      }
    >
      Stop emails to {row.email} about {title}. You&apos;ll still be able to use any gallery link you already have.
    </GuestMessage>
  );
}
