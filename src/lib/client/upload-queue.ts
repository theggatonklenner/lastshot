"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createStore, del, entries, set } from "idb-keyval";

export type QueueItem = {
  id: string; // clientUploadId: stays the same across retries so the server never double counts
  capturedAt: string;
  source: "camera" | "library";
  blob: Blob;
  state: "waiting" | "uploading" | "failed";
  progress: number;
  attempts: number;
  error?: string;
  /** Automatic retries are used up; waits for the guest to tap retry. */
  stuck?: boolean;
};

type Stored = Omit<QueueItem, "state" | "progress" | "error" | "stuck">;

export type QueueNotice = { tone: "error" | "info"; text: string; code?: string } | null;

const RETRY_DELAYS = [2000, 6000, 15000];
const TERMINAL = new Set([
  "limit_reached",
  "event_closed",
  "guest_blocked",
  "library_disabled",
  "invalid_image",
  "too_large",
  "event_not_found",
]);

let store: ReturnType<typeof createStore> | null = null;
function getStore() {
  if (!store) store = createStore("lastshot", "pending-uploads");
  return store;
}

export function guestToken(code: string): string | null {
  try {
    return localStorage.getItem(`lastshot:token:${code}`);
  } catch {
    return null;
  }
}

export function saveGuestToken(code: string, token: string) {
  try {
    localStorage.setItem(`lastshot:token:${code}`, token);
  } catch {
    // private mode: the httpOnly cookie still works
  }
}

type UploadResult =
  | { ok: true; shotsUsed: number }
  | { ok: false; retryable: boolean; code: string; message: string; shotsUsed?: number };

function send(code: string, item: QueueItem, onProgress: (p: number) => void): Promise<UploadResult> {
  return new Promise((resolve) => {
    const form = new FormData();
    form.append("photo", item.blob, `${item.id}.jpg`);
    form.append("clientUploadId", item.id);
    form.append("capturedAt", item.capturedAt);
    form.append("source", item.source);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/e/${code}/upload`);
    const token = guestToken(code);
    if (token) xhr.setRequestHeader("x-lastshot-guest", token);
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let json: { ok?: boolean; code?: string; message?: string; shotsUsed?: number } = {};
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
        resolve({ ok: true, shotsUsed: json.shotsUsed ?? 0 });
        return;
      }
      const errCode = json.code ?? `http_${xhr.status}`;
      resolve({
        ok: false,
        retryable: !TERMINAL.has(errCode),
        code: errCode,
        message: json.message ?? "The photo didn't send.",
        shotsUsed: json.shotsUsed,
      });
    };
    const offline = () =>
      resolve({ ok: false, retryable: true, code: "network", message: "No connection. The photo is safe on your phone." });
    xhr.onerror = offline;
    xhr.ontimeout = offline;
    xhr.send(form);
  });
}

export function useUploadQueue({
  code,
  initialUsed,
  demo = false,
}: {
  code: string;
  initialUsed: number;
  demo?: boolean;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [used, setUsed] = useState(initialUsed);
  const [notice, setNotice] = useState<QueueNotice>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const busy = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const prefix = `${code}:`;

  // Restore shots that were taken but not confirmed before a reload.
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    entries<string, Stored>(getStore())
      .then((rows) => {
        if (cancelled) return;
        const restored = rows
          .filter(([k]) => String(k).startsWith(prefix))
          .map(([, v]) => ({ ...v, state: "waiting" as const, progress: 0 }))
          .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
        setItems(restored);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [demo, prefix]);

  const patch = (id: string, p: Partial<QueueItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));
  const remove = (id: string) => {
    setItems((list) => list.filter((i) => i.id !== id));
    if (!demo) del(prefix + id, getStore()).catch(() => {});
  };

  const enqueue = useCallback(
    async (blob: Blob, source: "camera" | "library") => {
      const item: QueueItem = {
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        source,
        blob,
        state: "waiting",
        progress: 0,
        attempts: 0,
      };
      if (!demo) {
        const stored: Stored = { id: item.id, capturedAt: item.capturedAt, source, blob, attempts: 0 };
        await set(prefix + item.id, stored, getStore()).catch(() => {});
      }
      setNotice(null);
      setItems((list) => [...list, item]);
    },
    [demo, prefix],
  );

  // Upload one at a time, oldest first.
  useEffect(() => {
    if (!loaded || busy.current) return;
    const next = items.find((i) => i.state === "waiting");
    if (!next) return;
    busy.current = true;
    // This effect drives an external process (the network upload); marking the
    // item as uploading here is the start of that process.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    patch(next.id, { state: "uploading", progress: 0, error: undefined });

    const run = demo
      ? new Promise<UploadResult>((r) => setTimeout(() => r({ ok: true, shotsUsed: used + 1 }), 700))
      : send(code, next, (p) => patch(next.id, { progress: p }));

    run.then((res) => {
      busy.current = false;
      if (res.ok) {
        setUsed(res.shotsUsed);
        setJustSaved(true);
        timers.current.push(setTimeout(() => setJustSaved(false), 2500));
        remove(next.id);
        return;
      }
      if (typeof res.shotsUsed === "number") setUsed(res.shotsUsed);
      if (!res.retryable) {
        remove(next.id);
        setNotice({ tone: "error", text: res.message, code: res.code });
        return;
      }
      const attempts = next.attempts + 1;
      if (attempts <= RETRY_DELAYS.length && res.code !== "guest_not_found") {
        patch(next.id, { state: "failed", attempts, error: res.message, progress: 0 });
        const t = setTimeout(() => patch(next.id, { state: "waiting" }), RETRY_DELAYS[attempts - 1]);
        timers.current.push(t);
      } else {
        patch(next.id, { state: "failed", attempts, error: res.message, progress: 0, stuck: true });
      }
    });
  }, [items, loaded, code, demo, used]); // eslint-disable-line react-hooks/exhaustive-deps

  const retryAll = useCallback(() => {
    setItems((list) => list.map((i) => (i.state === "failed" ? { ...i, state: "waiting", attempts: 0, stuck: false } : i)));
  }, []);

  // Coming back online retries straight away.
  useEffect(() => {
    window.addEventListener("online", retryAll);
    const t = timers.current;
    return () => {
      window.removeEventListener("online", retryAll);
      t.forEach(clearTimeout);
    };
  }, [retryAll]);

  return {
    items,
    used,
    setUsed,
    loaded,
    notice,
    clearNotice: () => setNotice(null),
    justSaved,
    enqueue,
    retryAll,
    uploading: items.find((i) => i.state === "uploading") ?? null,
    failedCount: items.filter((i) => i.stuck).length,
  };
}
