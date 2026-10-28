"use client";

import { useState, useTransition } from "react";
import { retryFailedEmails, runEmailSender } from "@/app/admin/actions";
import { Button, Notice } from "@/components/ui";

export function EmailTools({ failedCount }: { failedCount: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const report = (res: Awaited<ReturnType<typeof runEmailSender>>) => {
    if (!res.ok) return setMessage({ tone: "error", text: res.error });
    const d = res.data!;
    if (d.skipped) return setMessage({ tone: "error", text: "Email isn't configured, so nothing was sent." });
    setMessage({
      tone: d.failed ? "error" : "success",
      text: `Sent ${d.sent}${d.failed ? `, ${d.failed} failed` : ""}.${d.sent + d.failed === 0 ? " Nothing was due." : ""}`,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" pending={pending} onClick={() => start(async () => report(await runEmailSender()))}>
          Send due emails now
        </Button>
        {failedCount > 0 && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => report(await retryFailedEmails()))}>
            Retry failed
          </Button>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
