"use client";

import { useState, useSyncExternalStore } from "react";

const KEY = "lastshot:home-hint-dismissed";
const noop = () => () => {};

/** iPhone Safari, not already opened from the home screen, tip not dismissed. */
function shouldShow(): boolean {
  try {
    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    // Safari and Chrome on iPhone can both add to the home screen.
    const safari = ios && !/FxiOS|EdgiOS|GSA\//.test(ua);
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
      <div className="flex-1">
        <p>
          <span className="font-semibold text-cream">Save this to your home screen</span> {reason}.
        </p>
        <HomeScreenSteps />
      </div>
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

/** Step-by-step for adding the page to an iPhone home screen (Safari or Chrome). */
export function HomeScreenSteps() {
  return (
    <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[15px] text-cream-dim marker:font-bold marker:text-cream">
      <li>
        Tap the <span className="font-semibold text-cream">Share</span> button
        <ShareIcon inline />. In Safari it&apos;s at the bottom of the screen. If you only see{" "}
        <span className="font-semibold text-cream">•••</span>, tap that first.
      </li>
      <li>
        Scroll down and tap <span className="font-semibold text-cream">Add to Home Screen</span>.
      </li>
      <li>
        Tap <span className="font-semibold text-cream">Add</span>, then open Lastshot from your home screen.
      </li>
    </ol>
  );
}

function ShareIcon({ inline }: { inline?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={inline ? "mx-1 inline size-4 -translate-y-0.5 text-flash" : "mt-0.5 size-5 shrink-0 text-flash"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}
