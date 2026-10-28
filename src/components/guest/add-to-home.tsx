"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "lastshot:home-hint-dismissed";
const noop = () => () => {};

/** iPhone Safari, not already opened from the home screen, tip not dismissed. */
function shouldShow(): boolean {
  try {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const safari = ios && !/CriOS|FxiOS|EdgiOS|GSA\//.test(ua);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return safari && !standalone && localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

/**
 * A small tip for iPhone guests: save the event to the home screen so it opens
 * full screen like an app, and they can get back to the gallery later.
 */
export function AddToHomeHint({ reason = "to get back to the gallery in one tap" }: { reason?: string }) {
  const eligible = useSyncExternalStore(noop, shouldShow, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!eligible || dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-[16px] border border-cream/15 bg-body-2 p-4 text-[15px] text-cream-dim">
      <ShareIcon />
      <p className="flex-1">
        <span className="font-semibold text-cream">Save this to your home screen</span> {reason}. Tap{" "}
        <span className="font-semibold text-cream">Share</span>, then{" "}
        <span className="font-semibold text-cream">Add to Home Screen</span>.
      </p>
      <button
        onClick={() => {
          try {
            localStorage.setItem(KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="-m-1 rounded-full px-2 py-1 text-sm font-semibold text-cream hover:bg-cream/10"
        aria-label="Hide tip"
      >
        Hide
      </button>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 text-flash" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
