"use client";

let sent = 0;

const IGNORE = [
  /ResizeObserver loop/,
  /chrome-extension:|moz-extension:|safari-extension:/,
  /Load failed|NetworkError|Failed to fetch/, // flaky connections, handled by retries
  /AbortError/,
];

const STALE_DEPLOY = /Server Action .* was not found on the server|Failed to find Server Action|UnrecognizedActionError/i;

/**
 * A tab left open across a new deployment still has the old page code, so its
 * buttons point at server actions that no longer exist. Reload once to pick up
 * the new version instead of showing an error.
 */
export function reloadIfStaleDeploy(error: unknown): boolean {
  const e = error as { message?: string; name?: string };
  const text = `${e?.name ?? ""} ${e?.message ?? String(error)}`;
  if (!STALE_DEPLOY.test(text)) return false;
  try {
    const key = "ls_stale_reload";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 30_000) return true; // already reloaded just now; don't loop
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* storage blocked: reload anyway */
  }
  location.reload();
  return true;
}

/** Sends a browser error to the server log. At most five per page load. */
export function reportClientError(error: unknown, extra?: { digest?: string }) {
  try {
    if (reloadIfStaleDeploy(error)) return;
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
