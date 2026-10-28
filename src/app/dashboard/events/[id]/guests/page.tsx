import type { Metadata } from "next";
import Link from "next/link";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { emailConfigured } from "@/lib/server/email";
import { formatDateTime, timeAgo } from "@/lib/format";
import { readyForEmail, remainingShots, shotLimit } from "@/lib/rules";
import { EmptyState } from "@/components/ui";
import { BlockButton } from "./block-button";
import { EmailList, type EmailRow } from "./email-list";

export const metadata: Metadata = { title: "Guests" };

export default async function GuestsPage({ params }: PageProps<"/dashboard/events/[id]/guests">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnedEvent(id);
  const limit = shotLimit(event);
  const [{ data: guests }, { data: photos }, { data: emails }] = await Promise.all([
    supabase.from("event_guests").select("*").eq("event_id", id).order("created_at"),
    supabase.from("photos").select("guest_id").eq("event_id", id).eq("upload_status", "complete"),
    supabase.from("guest_emails").select("*").eq("event_id", id).order("created_at"),
  ]);

  const kept = new Map<string, number>();
  for (const p of photos ?? []) kept.set(p.guest_id, (kept.get(p.guest_id) ?? 0) + 1);
  const label = new Map((guests ?? []).map((g, i) => [g.id, g.display_name || `Guest ${i + 1}`]));

  const emailRows: EmailRow[] = (emails ?? []).map((e) => ({
    id: e.id,
    email: e.email,
    guestName: (e.guest_id && label.get(e.guest_id)) || "Guest",
    createdAt: e.created_at,
    sentAt: e.sent_at,
    unsubscribedAt: e.unsubscribed_at,
    failed: !e.sent_at && e.attempts >= 5,
    lastError: e.last_error,
  }));

  const ready = readyForEmail(event);
  const readyHint = ready
    ? "The gallery is ready, so new addresses get their link straight away."
    : event.gallery_visibility === "private"
      ? "The gallery is private, so no emails will send."
      : event.reveal_mode === "scheduled" && event.reveal_at
        ? `Emails go out automatically at ${formatDateTime(event.reveal_at, event.timezone)}.`
        : event.reveal_mode === "manual"
          ? "Emails go out automatically when you reveal the gallery."
          : "Emails go out automatically when you end the event.";

  return (
    <div className="flex flex-col gap-6">
      {!guests?.length ? (
        <EmptyState title="Nobody has joined yet">
          Guests appear here when they open the camera. Each phone gets its own anonymous camera ID.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-graphite">
            Each row is one phone. Guests don&apos;t sign in, so a camera ID is tied to the browser it was opened in.
            Shots used includes photos you&apos;ve since deleted.
          </p>
          <div className="overflow-x-auto rounded-panel border border-line bg-card">
            <table className="w-full min-w-[640px] text-left text-[15px]">
              <thead className="border-b border-line text-sm text-graphite">
                <tr>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Camera ID</th>
                  <th className="px-4 py-3 font-semibold">Photos</th>
                  <th className="px-4 py-3 font-semibold">Shots left</th>
                  <th className="px-4 py-3 font-semibold">Last active</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {guests.map((g) => (
                  <tr key={g.id} className={g.blocked ? "bg-signal-soft/50" : undefined}>
                    <td className="px-4 py-3 font-semibold">
                      {label.get(g.id)}
                      {g.blocked && <span className="ml-2 rounded bg-signal px-1.5 text-xs text-white">Blocked</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-graphite numeric condensed">{g.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 numeric">
                      {kept.get(g.id) ? (
                        <Link href={`/dashboard/events/${id}/photos?guest=${g.id}`} className="font-semibold text-cobalt hover:underline">
                          {kept.get(g.id)}
                        </Link>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="px-4 py-3 numeric">
                      {remainingShots(limit, g.photos_submitted)} of {limit}
                    </td>
                    <td className="px-4 py-3 text-graphite">{timeAgo(g.last_active_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <BlockButton eventId={id} guestId={g.id} blocked={g.blocked} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EmailList
        eventId={id}
        title={event.title}
        timezone={event.timezone}
        rows={emailRows}
        ready={ready}
        configured={emailConfigured()}
        captureOn={event.email_capture_enabled && event.gallery_visibility !== "private"}
        readyHint={readyHint}
      />
    </div>
  );
}
