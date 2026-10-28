import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { emailConfigured } from "@/lib/server/email";
import { formatDateTime } from "@/lib/format";
import { Panel } from "@/components/ui";
import { EmailTools } from "./email-tools";

export const metadata: Metadata = { title: "Emails" };

export default async function AdminEmails() {
  await requireAdmin();
  const db = admin();
  const [{ data: failed }, { data: recent }] = await Promise.all([
    db
      .from("guest_emails")
      .select("id, email, event_id, attempts, last_error, created_at")
      .is("sent_at", null)
      .is("unsubscribed_at", null)
      .not("last_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("guest_emails").select("id, email, event_id, sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(20),
  ]);

  const eventIds = [...new Set([...(failed ?? []), ...(recent ?? [])].map((r) => r.event_id))];
  const { data: events } = eventIds.length
    ? await db.from("events").select("id, title").in("id", eventIds)
    : { data: [] as { id: string; title: string }[] };
  const titles = new Map((events ?? []).map((e) => [e.id, e.title]));

  const checks: [string, boolean, string][] = [
    ["RESEND_API_KEY and EMAIL_FROM", emailConfigured(), "Needed to send anything."],
    ["CRON_SECRET", !!process.env.CRON_SECRET, "Needed for scheduled reveals to email automatically."],
    ["NEXT_PUBLIC_SITE_URL", !!process.env.NEXT_PUBLIC_SITE_URL, "Recommended so email links use your main domain."],
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">Emails</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Setup</h2>
          <ul className="flex flex-col gap-3">
            {checks.map(([name, ok, hint]) => (
              <li key={name} className="flex items-start gap-3">
                <span className={`mt-1 size-3 shrink-0 rounded-full ${ok ? "bg-ok" : "bg-signal"}`} aria-hidden />
                <span>
                  <span className="font-semibold">{name}</span>
                  <span className="sr-only">{ok ? " is set" : " is missing"}</span>
                  <span className="block text-sm text-graphite">{ok ? "Set." : hint}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="mb-1 text-lg font-bold">Sender</h2>
          <p className="mb-4 text-graphite">
            Emails send when an organiser ends the event or reveals the gallery, and every 5 minutes for scheduled reveals.
            You can also run it now.
          </p>
          <EmailTools failedCount={failed?.length ?? 0} />
        </Panel>
      </div>

      <Panel>
        <h2 className="mb-4 text-lg font-bold">Problems</h2>
        {failed?.length ? (
          <ul className="divide-y divide-line">
            {failed.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5 py-3">
                <span className="font-semibold break-all">
                  {f.email}{" "}
                  <Link href={`/admin/events/${f.event_id}`} className="font-normal text-cobalt hover:underline">
                    {titles.get(f.event_id)}
                  </Link>
                </span>
                <span className="text-sm text-graphite">
                  {f.attempts >= 5 ? "Gave up after 5 tries" : `Try ${f.attempts} of 5`}: {f.last_error}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-graphite">No failed emails.</p>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-4 text-lg font-bold">Recently sent</h2>
        {recent?.length ? (
          <ul className="divide-y divide-line text-[15px]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="break-all">{r.email}</span>
                <span className="text-graphite">
                  {titles.get(r.event_id)}, {formatDateTime(r.sent_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-graphite">Nothing sent yet.</p>
        )}
      </Panel>
    </div>
  );
}
