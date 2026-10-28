"use client";

import { useEffect, useState } from "react";
import { guestToken } from "@/lib/client/upload-queue";
import { cx } from "@/components/ui";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function saveNotifyEmail(code: string, email: string): Promise<{ ok: boolean; message?: string }> {
  const token = guestToken(code);
  const res = await fetch(`/api/e/${code}/notify`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-lastshot-guest": token } : {}) },
    body: JSON.stringify({ email }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, message: json.message ?? "That didn't save. Try again." };
}

/** "Email me the photos" box for the finished-roll and event pages. */
export function EmailCapture({ code, alreadyOpen }: { code: string; alreadyOpen?: boolean }) {
  const [saved, setSaved] = useState<string[] | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = guestToken(code);
    fetch(`/api/e/${code}/notify`, { headers: token ? { "x-lastshot-guest": token } : {} })
      .then((r) => r.json())
      .then((j) => setSaved((j.emails ?? []).map((e: { email: string }) => e.email)))
      .catch(() => setSaved([]));
  }, [code]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("That email address doesn't look right.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await saveNotifyEmail(code, value);
    setBusy(false);
    if (!res.ok) return setError(res.message ?? null);
    setSaved((s) => [...(s ?? []), value.toLowerCase()]);
    setEmail("");
  }

  if (saved === null) return null;

  if (saved.length > 0) {
    return (
      <p className="rounded-[14px] bg-body-2 px-4 py-3 text-[15px] text-cream-dim">
        {alreadyOpen ? "We've sent" : "We'll email"} a private gallery link to{" "}
        <strong className="text-cream">{saved.join(", ")}</strong>
        {alreadyOpen ? "." : " when the photos are ready."}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-3 rounded-[18px] bg-body-2 p-4" noValidate>
      <label htmlFor="notify-email" className="font-semibold text-cream">
        {alreadyOpen ? "Email me a link to the gallery" : "Email me when the photos are ready"}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="notify-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-12 flex-1 rounded-[12px] border border-cream/20 bg-body px-4 text-cream placeholder:text-cream/40 focus:border-flash focus:outline-none"
        />
        <button
          disabled={busy}
          className={cx("h-12 rounded-full bg-cream px-5 font-bold text-body disabled:opacity-50")}
        >
          {busy ? "Saving" : "Email me"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-flash">
          {error}
        </p>
      ) : (
        <p className="text-sm text-cream-dim">One email with a private link. Nothing else.</p>
      )}
    </form>
  );
}
