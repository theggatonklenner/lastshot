"use client";

let sent = 0;

const IGNORE = [
  /ResizeObserver loop/,
  /chrome-extension:|moz-extension:|safari-extension:/,
  /Load failed|NetworkError|Failed to fetch/, // flaky connections, handled by retries
  /AbortError/,
];

/** Sends a browser error to the server log. At most five per page load. */
export function reportClientError(error: unknown, extra?: { digest?: string }) {
  try {
    const e = error as { message?: string; stack?: string; digest?: string };
    const message = e?.message ?? String(error);
    if (!message || IGNORE.some((r) => r.test(message) || r.test(e?.stack ?? ""))) return;
    if (++sent > 5) return;
    const body = JSON.stringify({
      message: message.slice(0, 1000),
      stack: e?.stack?.slice(0, 4000) ?? null,
      path: location.pathname,
      digest: extra?.digest ?? e?.digest ?? null,
    });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
  } catch {
    /* never let reporting break the page */
  }
}
