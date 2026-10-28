"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { guestToken, saveGuestToken } from "@/lib/client/upload-queue";
import { guestButton, guestSecondary } from "@/components/guest/guest-shell";
import { cx } from "@/components/ui";
import { EMAIL_RE, EmailCapture, saveNotifyEmail } from "@/components/guest/email-capture";
import { SmsCapture } from "@/components/guest/sms-capture";
import { AddToHomeHint } from "@/components/guest/add-to-home";
import { normalisePhone } from "@/lib/phone";
import { MARKETING_CONSENT } from "@/lib/marketing";

type Joined = { displayName: string | null; shotsUsed: number; shotsLimit: number } | null;

export function JoinPanel({
  code,
  limit,
  joined: initialJoined,
  needsCode,
  accepting,
  galleryHref,
  preview,
  previewCameraHref,
  emailCapture,
  smsCapture,
}: {
  emailCapture?: boolean;
  smsCapture?: boolean;
  code: string;
  limit: number;
  joined: Joined;
  needsCode: boolean;
  accepting: boolean;
  galleryHref: string | null;
  preview?: boolean;
  previewCameraHref?: string;
}) {
  const router = useRouter();
  const [joined, setJoined] = useState<Joined>(initialJoined);
  const [name, setName] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If the cookie was cleared but this browser still has its camera token,
  // restore it quietly so the guest keeps the same roll.
  useEffect(() => {
    if (initialJoined || preview) return;
    const token = guestToken(code);
    if (!token) return;
    fetch(`/api/e/${code}/join`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-lastshot-guest": token },
      body: JSON.stringify({ consent: true }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.ok) {
          // The server only resumes an existing guest for a known token.
          setJoined(json.guest);
        }
      })
      .catch(() => {});
  }, [code, initialJoined, preview]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return;
    if (!consent) {
      setError("Tick the box to agree to the event rules.");
      return;
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      setError("That email address doesn't look right. Fix it or leave it blank.");
      return;
    }
    const mobile = phone.trim() ? normalisePhone(phone) : null;
    if (phone.trim() && !mobile) {
      setError("That mobile number doesn't look right. Fix it or leave it blank.");
      return;
    }
    if (mobile && !mobile.startsWith("+614")) {
      setError("Texts only go to Australian mobiles. Leave the number blank or use an Australian one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/e/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(guestToken(code) ? { "x-lastshot-guest": guestToken(code)! } : {}) },
        body: JSON.stringify({ displayName: name || null, accessCode: accessCode || null, consent: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Couldn't join. Try again.");
      saveGuestToken(code, json.token);
      if (email.trim()) await saveNotifyEmail(code, email.trim()).catch(() => null);
      if (marketing && (email.trim() || mobile)) {
        await fetch(`/api/e/${code}/marketing`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-lastshot-guest": json.token },
          body: JSON.stringify({ email: email.trim() || null, phone: mobile }),
        }).catch(() => null);
      }
      if (mobile) {
        await fetch(`/api/e/${code}/sms`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-lastshot-guest": json.token },
          body: JSON.stringify({ phone: mobile }),
        }).catch(() => null);
      }
      router.push(`/e/${code}/camera`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join. Try again.");
      setBusy(false);
    }
  }

  if (joined) {
    const left = Math.max(0, joined.shotsLimit - joined.shotsUsed);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg text-cream-dim">
          {joined.displayName ? `Welcome back, ${joined.displayName}. ` : "Welcome back. "}
          {left > 0 ? `You have ${left === 1 ? "1 shot" : `${left} shots`} left.` : "You've used your whole roll."}
        </p>
        {left > 0 && accepting && (
          <Link href={`/e/${code}/camera`} className={guestButton}>
            Open my camera
          </Link>
        )}
        {galleryHref && (
          <Link href={galleryHref} className={guestSecondary}>
            See the gallery
          </Link>
        )}
        {smsCapture && <SmsCapture code={code} />}
        {emailCapture && <EmailCapture code={code} />}
        <AddToHomeHint reason="so your camera and the gallery are one tap away" />
      </div>
    );
  }

  if (!accepting) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-lg text-cream-dim">This event isn&apos;t taking new photos right now.</p>
        {galleryHref && (
          <Link href={galleryHref} className={guestSecondary}>
            See the gallery
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={join} className="flex flex-col gap-5" noValidate>
      <label className="flex flex-col gap-2">
        <span className="font-semibold">Your name (optional)</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          autoComplete="given-name"
          placeholder="So people know who took it"
          className="h-13 rounded-[14px] border border-cream/20 bg-body-2 px-4 text-lg text-cream placeholder:text-cream/40 focus:border-flash focus:outline-none"
        />
      </label>
      {emailCapture && (
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Email me the photos (optional)</span>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            autoComplete="email"
            placeholder="We'll send one link when they're ready"
            className="h-13 rounded-[14px] border border-cream/20 bg-body-2 px-4 text-lg text-cream placeholder:text-cream/40 focus:border-flash focus:outline-none"
          />
        </label>
      )}
      {smsCapture && (
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Text me when the photos are ready (optional)</span>
          <input
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
            autoComplete="tel"
            placeholder="0412 345 678"
            className="h-13 rounded-[14px] border border-cream/20 bg-body-2 px-4 text-lg text-cream placeholder:text-cream/40 focus:border-flash focus:outline-none"
          />
          <span className="text-sm text-cream-dim">Australian mobiles only. One text with a private link.</span>
        </label>
      )}
      {(emailCapture || smsCapture) && (email.trim() || phone.trim()) && (
        <label className="flex cursor-pointer items-start gap-3 text-[15px] text-cream-dim">
          <input
            type="checkbox"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 accent-[#ffd23f]"
          />
          <span>{MARKETING_CONSENT} (Optional)</span>
        </label>
      )}
      {needsCode && (
        <label className="flex flex-col gap-2">
          <span className="font-semibold">Access code</span>
          <input
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
            maxLength={32}
            autoComplete="off"
            autoCapitalize="characters"
            placeholder="From the sign or the organiser"
            className="h-13 rounded-[14px] border border-cream/20 bg-body-2 px-4 text-lg tracking-wider text-cream uppercase placeholder:tracking-normal placeholder:normal-case placeholder:text-cream/40 focus:border-flash focus:outline-none"
          />
        </label>
      )}
      <label className="flex cursor-pointer items-start gap-3 text-[15px] text-cream-dim">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[#ffd23f]"
        />
        <span>
          I&apos;ll only take photos people are happy to share. My photos go to the event organiser and may be shown to
          other guests. I agree to the{" "}
          <Link href="/terms" className="text-cream underline underline-offset-4" target="_blank">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-cream underline underline-offset-4" target="_blank">
            privacy notice
          </Link>
          .
        </span>
      </label>
      {error && (
        <p role="alert" className="rounded-[12px] bg-signal/20 px-4 py-3 text-cream">
          {error}
        </p>
      )}
      {preview ? (
        <div className="flex flex-col gap-2">
          <Link href={previewCameraHref ?? "/try"} className={guestButton}>
            Try this camera
          </Link>
          <p className="text-sm text-cream-dim">Preview mode: photos you take here aren&apos;t uploaded.</p>
        </div>
      ) : (
        <button type="submit" disabled={busy} className={cx(guestButton)}>
          {busy ? "Loading your camera" : `Get my ${limit} shots`}
        </button>
      )}
      {galleryHref && (
        <Link href={galleryHref} className={guestSecondary}>
          See the gallery
        </Link>
      )}
    </form>
  );
}
