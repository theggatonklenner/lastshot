"use client";

import { useState, useTransition } from "react";
import { retryFailedSms, runSmsSender, sendTestSms } from "@/app/admin/actions";
import { Button, Input, Notice } from "@/components/ui";

export function SmsTools({ failedCount }: { failedCount: number }) {
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const report = (res: Awaited<ReturnType<typeof runSmsSender>>) => {
    if (!res.ok) return setMessage({ tone: "error", text: res.error });
    const d = res.data!;
    if (d.skipped) return setMessage({ tone: "error", text: "Texting isn't connected, so nothing was sent." });
    setMessage({
      tone: d.failed ? "error" : "success",
      text: `Sent ${d.sent}${d.failed ? `, ${d.failed} failed` : ""}.${d.sent + d.failed === 0 ? " Nothing was due." : ""}`,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" pending={pending} onClick={() => start(async () => report(await runSmsSender()))}>
          Send due texts now
        </Button>
        {failedCount > 0 && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(async () => report(await retryFailedSms()))}>
            Retry failed
          </Button>
        )}
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await sendTestSms(phone);
            setMessage(
              res.ok
                ? { tone: "success", text: `Test text sent to ${res.data?.to}. It should arrive within a minute.` }
                : { tone: "error", text: `Test text failed: ${res.error}` },
            );
          });
        }}
      >
        <label htmlFor="test-phone" className="sr-only">
          Mobile number for a test text
        </label>
        <Input id="test-phone" type="tel" inputMode="tel" placeholder="Your mobile, e.g. 0412 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} className="sm:max-w-xs" />
        <Button type="submit" size="sm" variant="secondary" disabled={pending || !phone.trim()}>
          Send test text
        </Button>
      </form>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
