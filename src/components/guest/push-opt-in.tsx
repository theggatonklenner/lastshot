"use client";

import { useEffect, useState } from "react";
import { guestToken } from "@/lib/client/upload-queue";
import { HomeScreenSteps } from "@/components/guest/add-to-home";

type State = "checking" | "unsupported" | "ios-install" | "ready" | "working" | "on" | "denied";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * "Notify me on this phone" for when the photos are ready. Free, unlike SMS.
 * iPhones only allow it once the page is added to the Home Screen.
 */
export function PushOptIn({ code, compact }: { code: string; compact?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState<string | null>(null);
  const key = `lastshot:push:${code}`;

  useEffect(() => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    let next: State;
    if (!supported) next = ios && !standalone ? "ios-install" : "unsupported";
    else if (Notification.permission === "denied") next = "denied";
    else {
      let saved = false;
      try {
        saved = localStorage.getItem(key) === "1";
      } catch {
        /* ignore */
      }
      next = saved && Notification.permission === "granted" ? "on" : "ready";
    }
    // Browser features are only known after mounting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(next);
  }, [key]);

  async function enable() {
    setError(null);
    setState("working");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "ready");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/key")).json();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const token = guestToken(code);
      const res = await fetch(`/api/e/${code}/push`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-lastshot-guest": token } : {}) },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? "That didn't work. Try again.");
      try {
        localStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Try again.");
      setState("ready");
    }
  }

  if (state === "checking" || state === "unsupported" || state === "denied") return null;

  if (state === "on") {
    return (
      <p className="rounded-[14px] bg-body-2 px-4 py-3 text-[15px] text-cream-dim">
        You&apos;ll get a notification on this phone when the photos are ready.
      </p>
    );
  }

  if (state === "ios-install") {
    return compact ? null : (
      <div className="rounded-[18px] bg-body-2 p-4">
        <p className="font-semibold text-cream">Get a notification when the photos are ready</p>
        <p className="mt-1 text-[15px] text-cream-dim">
          iPhones only send notifications to sites saved on the home screen. It takes 10 seconds:
        </p>
        <HomeScreenSteps />
        <p className="mt-2 text-sm text-cream-dim">Then open this event from the new icon and tap &quot;Notify me&quot;.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-body-2 p-4">
      <p className="font-semibold text-cream">Get a notification when the photos are ready</p>
      <button
        type="button"
        onClick={enable}
        disabled={state === "working"}
        className="h-12 rounded-full bg-cream px-5 font-bold text-body disabled:opacity-50"
      >
        {state === "working" ? "Turning on" : "Notify me on this phone"}
      </button>
      {error ? <p className="text-sm text-flash">{error}</p> : <p className="text-sm text-cream-dim">Free. One notification, nothing else.</p>}
    </div>
  );
}
