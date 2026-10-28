import type { Metadata } from "next";
import Link from "next/link";
import { requireOwnedEvent } from "@/lib/server/organiser";
import { emailConfigured } from "@/lib/server/email";
import { smsConfigured } from "@/lib/server/sms";
import { formatPhone } from "@/lib/phone";
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
  const [{ data: guests }, { data: photos }, { data: emails }, { data: texts }] = await Promise.all([
    supabase.from("event_guests").select("*").eq("event_id", id).order("created_at"),
    supabase.from("photos").select("guest_id").eq("event_id", id).eq("upload_status", "complete"),
    supabase.from("guest_emails").select("*").eq("event_id", id).order("created_at"),
    supabase.from("guest_sms").select("phone, sent_at, attempts, last_error").eq("event_id", id).order("created_at"),
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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-card px-4 py-3">
        <p className="text-[15px] text-graphite">
          {event.addon_export
            ? "Download every guest with their photo count, contacts and answers to your questions."
            : "Want a spreadsheet of your guests, with answers to your own questions? Add Guest data export."}
        </p>
        {event.addon_export ? (
          <a
            href={`/api/events/${event.id}/export`}
            download
            className="rounded-[10px] border border-line px-3 py-1.5 text-sm font-semibold hover:border-ink/30"
          >
            Download spreadsheet
          </a>
        ) : (
          <Link
            href={`/dashboard/events/${event.id}/upgrade?o_plan=${event.plan}&o_addons=export#addons`}
            className="text-sm font-semibold text-cobalt hover:underline"
          >
            Add it for $9
          </Link>
        )}
      </div>
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
          {/* Phones: one card per guest */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {guests.map((g) => (
              <li
                key={g.id}
                className={`flex items-center justify-between gap-3 rounded-panel border border-line p-4 ${g.blocked ? "bg-signal-soft/50" : "bg-card"}`}
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {label.get(g.id)}
                    {g.blocked && <span className="ml-2 rounded bg-signal px-1.5 text-xs text-white">Blocked</span>}
                  </p>
                  <p className="text-sm text-graphite numeric">
                    {kept.get(g.id) ? (
                      <Link href={`/dashboard/events/${id}/photos?guest=${g.id}`} className="font-semibold text-cobalt">
                        {kept.get(g.id)} photos
                      </Link>
                    ) : (
                      "0 photos"
                    )}
                    {" · "}
                    {remainingShots(limit, g.photos_submitted)} of {limit} left · {timeAgo(g.last_active_at)}
                  </p>
                </div>
                <BlockButton eventId={id} guestId={g.id} blocked={g.blocked} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-panel border border-line bg-card sm:block">
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

      {event.addon_sms && (
        <section className="rounded-panel border border-line bg-card p-5">
          <h2 className="text-lg font-bold">Text alerts</h2>
          <p className="mt-1 text-graphite">
            {(texts ?? []).length === 0
              ? "No one has asked for a text yet. Guests see the option on the event page and when their roll is finished."
              : `${(texts ?? []).length} ${(texts ?? []).length === 1 ? "number" : "numbers"}, ${(texts ?? []).filter((t) => t.sent_at).length} texted so far. Each gets one text with a private gallery link when the photos are ready.`}
          </p>
          {!smsConfigured() && <p className="mt-2 text-sm text-signal">Texting isn&apos;t switched on yet, so texts will wait until it is.</p>}
          {(texts ?? []).length > 0 && (
            <ul className="mt-3 divide-y divide-line text-[15px]">
              {(texts ?? []).map((t) => (
                <li key={t.phone} className="flex justify-between gap-3 py-2">
                  <span className="numeric">{formatPhone(t.phone)}</span>
                  <span className="text-sm text-graphite">{t.sent_at ? "Texted" : t.attempts >= 5 ? "Failed" : "Waiting"}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
