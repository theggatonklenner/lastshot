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
  const [{ data: failed }, { data: recent }, { data: marketing }] = await Promise.all([
    db
      .from("guest_emails")
      .select("id, email, event_id, attempts, last_error, created_at")
      .is("sent_at", null)
      .is("unsubscribed_at", null)
      .not("last_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    db.from("guest_emails").select("id, email, event_id, sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(20),
    db.from("marketing_contacts").select("channel").is("unsubscribed_at", null),
  ]);
  const optEmail = (marketing ?? []).filter((m) => m.channel === "email").length;
  const optSms = (marketing ?? []).filter((m) => m.channel === "sms").length;

  const eventIds = [...new Set([...(failed ?? []), ...(recent ?? [])].map((r) => r.event_id))];
  const { data: events } = eventIds.length
    ? await db.from("events").select("id, title").in("id", eventIds)
    : { data: [] as { id: string; title: string }[] };
  const titles = new Map((events ?? []).map((e) => [e.id, e.title]));

  // [name, state, text when set, text when not set]
  const checks: [string, "ok" | "missing" | "optional", string][] = [
    [
      "RESEND_API_KEY and EMAIL_FROM",
      emailConfigured() ? "ok" : "missing",
      emailConfigured() ? "Set." : "Needed to send anything.",
    ],
    [
      "Scheduled sender",
      "ok",
      "Supabase checks every 5 minutes and sends emails for scheduled reveals.",
    ],
    [
      "CRON_SECRET",
      process.env.CRON_SECRET ? "ok" : "optional",
      process.env.CRON_SECRET
        ? "Set. The scheduler must send the same value (Vault: lastshot_cron_secret)."
        : "Optional, not needed. Only adds an extra lock on the scheduler endpoint.",
    ],
  ];
  const dot = { ok: "bg-ok", missing: "bg-signal", optional: "bg-line" };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">Emails</h1>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Marketing list</h2>
            <p className="text-graphite">
              Guests who ticked &quot;news and offers&quot; when joining: {optEmail} {optEmail === 1 ? "email" : "emails"} and {optSms}{" "}
              {optSms === 1 ? "mobile" : "mobiles"}. Every message you send them must include a way to unsubscribe.
            </p>
          </div>
          {/* A file download, so a plain link. */}
          <a href="/api/admin/marketing" download className="rounded-[10px] border border-line px-3 py-2 text-sm font-semibold hover:border-ink/30">
            Download CSV
          </a>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Setup</h2>
          <ul className="flex flex-col gap-3">
            {checks.map(([name, state, text]) => (
              <li key={name} className="flex items-start gap-3">
                <span className={`mt-1 size-3 shrink-0 rounded-full ${dot[state]}`} aria-hidden />
                <span>
                  <span className="font-semibold">{name}</span>
                  <span className="sr-only">{state === "ok" ? " is working" : state === "missing" ? " is missing" : " is optional"}</span>
                  <span className="block text-sm text-graphite">{text}</span>
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
