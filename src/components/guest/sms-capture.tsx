"use client";

import { useEffect, useState } from "react";
import { guestToken } from "@/lib/client/upload-queue";
import { normalisePhone } from "@/lib/phone";

/** "Text me when the photos are ready" box (SMS alerts add-on). */
export function SmsCapture({ code, alreadyOpen }: { code: string; alreadyOpen?: boolean }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = guestToken(code);
    fetch(`/api/e/${code}/sms`, { headers: token ? { "x-lastshot-guest": token } : {} })
      .then((r) => r.json())
      .then((j) => setSaved(j.phones ?? []))
      .catch(() => setSaved([]));
  }, [code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!normalisePhone(phone)) {
      setError("Enter a mobile number, like 0412 345 678.");
      return;
    }
    setBusy(true);
    setError(null);
    const token = guestToken(code);
    const res = await fetch(`/api/e/${code}/sms`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-lastshot-guest": token } : {}) },
      body: JSON.stringify({ phone }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.message ?? "That didn't save. Try again.");
    setSaved((s) => [...(s ?? []), json.phone]);
    setPhone("");
  }

  if (saved === null) return null;
  if (saved.length > 0) {
    return (
      <p className="rounded-[14px] bg-body-2 px-4 py-3 text-[15px] text-cream-dim">
        {alreadyOpen ? "We've texted" : "We'll text"} a private gallery link to <strong className="text-cream">{saved.join(", ")}</strong>
        {alreadyOpen ? "." : " when the photos are ready."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 rounded-[18px] bg-body-2 p-4" noValidate>
      <label htmlFor="notify-phone" className="font-semibold text-cream">
        {alreadyOpen ? "Text me a link to the gallery" : "Text me when the photos are ready"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="notify-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0412 345 678"
          className="h-12 flex-1 rounded-[12px] border border-cream/20 bg-body px-4 text-cream placeholder:text-cream/40 focus:border-flash focus:outline-none"
        />
        <button disabled={busy} className="h-12 rounded-full bg-cream px-5 font-bold text-body disabled:opacity-50">
          {busy ? "Saving" : "Text me"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-flash">
          {error}
        </p>
      ) : (
        <p className="text-sm text-cream-dim">One text with a private link. Nothing else.</p>
      )}
    </form>
  );
}
