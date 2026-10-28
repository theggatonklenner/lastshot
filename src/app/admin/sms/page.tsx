import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { admin } from "@/lib/supabase/admin";
import { smsBalance, smsConfigured, smsProvider } from "@/lib/server/sms";
import { formatPhone } from "@/lib/phone";
import { formatDateTime } from "@/lib/format";
import { Panel } from "@/components/ui";
import { SmsTools } from "./sms-tools";

export const metadata: Metadata = { title: "SMS" };

export default async function AdminSms() {
  await requireAdmin();
  const db = admin();
  const configured = smsConfigured();
  const provider = smsProvider();
  const providerName = provider === "texto" ? "Texto" : provider === "clicksend" ? "ClickSend" : "Texto";
  const [balance, { count: total }, { count: sent }, { count: waiting }, { data: failed }, { data: recent }, { count: events }] =
    await Promise.all([
      smsBalance(),
      db.from("guest_sms").select("id", { count: "exact", head: true }),
      db.from("guest_sms").select("id", { count: "exact", head: true }).not("sent_at", "is", null),
      db.from("guest_sms").select("id", { count: "exact", head: true }).is("sent_at", null).is("unsubscribed_at", null).lt("attempts", 5),
      db
        .from("guest_sms")
        .select("id, phone, event_id, attempts, last_error, created_at")
        .is("sent_at", null)
        .not("last_error", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("guest_sms").select("id, phone, event_id, sent_at").not("sent_at", "is", null).order("sent_at", { ascending: false }).limit(20),
      db.from("events").select("id", { count: "exact", head: true }).eq("addon_sms", true),
    ]);

  const eventIds = [...new Set([...(failed ?? []), ...(recent ?? [])].map((r) => r.event_id))];
  const { data: evs } = eventIds.length
    ? await db.from("events").select("id, title").in("id", eventIds)
    : { data: [] as { id: string; title: string }[] };
  const titles = new Map((evs ?? []).map((e) => [e.id, e.title]));
  const gaveUp = (failed ?? []).filter((f) => f.attempts >= 5).length;

  const checks: [string, "ok" | "missing" | "optional", string][] = [
    [
      "TEXTO_API_KEY",
      configured ? "ok" : "missing",
      configured
        ? `Set. Texts are sent through ${providerName}.`
        : "Not set, so texts aren't sent yet. Guests can still leave numbers, and their texts go out once this is set.",
    ],
    [
      `${providerName} account`,
      !configured ? "missing" : balance ? "ok" : "optional",
      !configured
        ? `Connect ${providerName} to see your balance.`
        : balance
          ? `Connected. Balance: ${balance.text}.`
          : `Couldn't read the balance. Send a test text below to check the connection.`,
    ],
    [
      "SMS_FROM",
      process.env.SMS_FROM ? "ok" : "optional",
      process.env.SMS_FROM
        ? `Texts come from "${process.env.SMS_FROM}".`
        : `Optional. Without it, texts come from your ${providerName} account's default number.`,
    ],
  ];
  const dot = { ok: "bg-ok", missing: "bg-signal", optional: "bg-line" };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="display-md text-4xl">SMS</h1>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line lg:grid-cols-4">
        {[
          ["Events with SMS", events ?? 0],
          ["Numbers collected", total ?? 0],
          ["Texts sent", sent ?? 0],
          ["Waiting", waiting ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="flex flex-col gap-1 bg-card p-4">
            <dt className="text-sm text-graphite">{label}</dt>
            <dd className="display text-3xl numeric">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Panel>
          <h2 className="mb-4 text-lg font-bold">Setup</h2>
          <ul className="flex flex-col gap-3">
            {checks.map(([name, state, text]) => (
              <li key={name} className="flex items-start gap-3">
                <span className={`mt-1 size-3 shrink-0 rounded-full ${dot[state]}`} aria-hidden />
                <span className="min-w-0">
                  <span className="font-semibold break-words">{name}</span>
                  <span className="block text-sm text-graphite">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="mb-1 text-lg font-bold">Sender</h2>
          <p className="mb-4 text-graphite">
            Texts go out with the emails: when an organiser ends or reveals an event, and every 5 minutes for scheduled
            reveals. Each number gets one text.
          </p>
          <SmsTools failedCount={gaveUp} />
        </Panel>
      </div>

      <Panel>
        <h2 className="mb-4 text-lg font-bold">Problems</h2>
        {failed?.length ? (
          <ul className="divide-y divide-line">
            {failed.map((f) => (
              <li key={f.id} className="flex flex-col gap-0.5 py-3">
                <span className="font-semibold">
                  <span className="numeric">{formatPhone(f.phone)}</span>{" "}
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
          <p className="text-graphite">No failed texts.</p>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-4 text-lg font-bold">Recently sent</h2>
        {recent?.length ? (
          <ul className="divide-y divide-line text-[15px]">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="numeric">{formatPhone(r.phone)}</span>
                <span className="text-graphite">
                  {titles.get(r.event_id)}, {formatDateTime(r.sent_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-graphite">No texts sent yet.</p>
        )}
      </Panel>
    </div>
  );
}
