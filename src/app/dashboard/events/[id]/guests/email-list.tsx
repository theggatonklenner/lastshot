"use client";

import { useState, useTransition } from "react";
import { removeGuestEmail, sendGalleryEmailsNow } from "@/app/dashboard/actions";
import { Button, Notice, Panel } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { saveBlob } from "@/lib/client/zip";

export type EmailRow = {
  id: string;
  email: string;
  guestName: string;
  createdAt: string;
  sentAt: string | null;
  unsubscribedAt: string | null;
  failed: boolean;
  lastError: string | null;
};

function status(r: EmailRow): { label: string; cls: string } {
  if (r.unsubscribedAt) return { label: "Unsubscribed", cls: "bg-paper-2 text-graphite" };
  if (r.sentAt) return { label: "Sent", cls: "bg-ok-soft text-ok" };
  if (r.failed) return { label: "Failed", cls: "bg-signal-soft text-signal" };
  return { label: "Waiting", cls: "bg-cobalt-soft text-cobalt-deep" };
}

export function EmailList({
  eventId,
  title,
  timezone,
  rows,
  ready,
  configured,
  captureOn,
  readyHint,
}: {
  eventId: string;
  title: string;
  timezone: string;
  rows: EmailRow[];
  ready: boolean;
  configured: boolean;
  captureOn: boolean;
  readyHint: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const waiting = rows.filter((r) => !r.sentAt && !r.unsubscribedAt).length;

  function sendNow() {
    start(async () => {
      const res = await sendGalleryEmailsNow(eventId);
      if (!res.ok) return setMessage({ tone: "error", text: res.error });
      const { sent = 0, failed = 0 } = res.data ?? {};
      setMessage(
        failed
          ? { tone: "error", text: `Sent ${sent}, ${failed} didn't go through. They'll retry automatically.` }
          : { tone: "success", text: sent ? `Sent ${sent === 1 ? "1 email" : `${sent} emails`}.` : "Everyone has already been emailed." },
      );
    });
  }

  function remove(id: string) {
    if (!window.confirm("Remove this email address? They won't get the gallery link.")) return;
    start(async () => {
      const res = await removeGuestEmail(eventId, id);
      if (!res.ok) setMessage({ tone: "error", text: res.error });
    });
  }

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Email", "Guest", "Added", "Status"].join(","),
      ...rows.map((r) => [r.email, r.guestName, r.createdAt, status(r).label].map(esc).join(",")),
    ];
    saveBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${title.replace(/[^\w]+/g, "-")}-emails.csv`);
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Gallery emails</h2>
          <p className="max-w-xl text-[15px] text-graphite">
            {captureOn
              ? `Guests who leave an email get one private link to see and download the photos. ${readyHint}`
              : "Email collection is off for this event. Turn it on in Settings."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {rows.length > 0 && (
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              Export CSV
            </Button>
          )}
          {waiting > 0 && (
            <Button size="sm" onClick={sendNow} pending={pending} disabled={!ready || !configured}>
              Send to {waiting} now
            </Button>
          )}
        </div>
      </div>

      {!configured && rows.length > 0 && (
        <div className="mt-4">
          <Notice tone="warn">Email sending isn&apos;t set up yet, so nothing will send. Add the Resend settings in Vercel.</Notice>
        </div>
      )}
      {message && (
        <div className="mt-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="mt-5 text-graphite">No one has left an email yet.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[15px]">
            <thead className="border-b border-line text-sm text-graphite">
              <tr>
                <th className="py-2 pr-4 font-semibold">Email</th>
                <th className="py-2 pr-4 font-semibold">Guest</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const s = status(r);
                return (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-4 font-semibold break-all">{r.email}</td>
                    <td className="py-2.5 pr-4 text-graphite">{r.guestName}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-sm font-semibold ${s.cls}`} title={r.lastError ?? undefined}>
                        {s.label}
                      </span>
                      {r.sentAt && <span className="ml-2 text-sm text-graphite">{formatDateTime(r.sentAt, timezone)}</span>}
                    </td>
                    <td className="py-2.5 text-right">
                      <Button size="sm" variant="ghost" onClick={() => remove(r.id)} disabled={pending}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
