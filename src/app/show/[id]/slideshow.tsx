"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { cx } from "@/components/ui";

type Photo = { id: string; url: string; at: string | null };
type Slide = { key: number; photo: Photo; fresh: boolean };

const POLL_MS = 12_000;
const SPEEDS = [5, 8, 12] as const;

function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function preload(url: string) {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

export function Slideshow({
  eventId,
  title,
  guestUrl,
  shots,
}: {
  eventId: string;
  title: string;
  guestUrl: string;
  shots: number;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(8);
  const [showQr, setShowQr] = useState(true);
  const [chrome, setChrome] = useState(true);
  const [offline, setOffline] = useState(false);

  // Playback state lives in refs so the timer never works from stale data.
  const photos = useRef(new Map<string, Photo>());
  const fresh = useRef<string[]>([]);
  const deck = useRef<string[]>([]);
  const deckPos = useRef(0);
  const shownId = useRef<string | null>(null);
  const keyRef = useRef(0);
  const firstLoad = useRef(true);

  useEffect(() => {
    QRCode.toDataURL(guestUrl, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#16171a", light: "#ffffff" },
    }).then(setQr);
  }, [guestUrl]);

  /** Picks the next photo: anything new first, then a shuffled loop of the rest. */
  const nextPhoto = useCallback((): { photo: Photo; fresh: boolean } | null => {
    while (fresh.current.length) {
      const id = fresh.current.shift()!;
      const p = photos.current.get(id);
      if (p) return { photo: p, fresh: true };
    }
    const all = [...photos.current.keys()];
    if (!all.length) return null;
    for (let tries = 0; tries < all.length + 1; tries++) {
      if (deckPos.current >= deck.current.length) {
        deck.current = shuffle(all);
        // Don't show the same photo twice in a row across a reshuffle.
        if (deck.current.length > 1 && deck.current[0] === shownId.current)
          deck.current.push(deck.current.shift()!);
        deckPos.current = 0;
      }
      const id = deck.current[deckPos.current++];
      const p = photos.current.get(id);
      if (p) return { photo: p, fresh: false };
    }
    return null;
  }, []);

  const advance = useCallback(async () => {
    const next = nextPhoto();
    if (!next) return;
    await preload(next.photo.url);
    shownId.current = next.photo.id;
    const key = ++keyRef.current;
    setSlides((s) => [
      ...s.slice(-1),
      { key, photo: next.photo, fresh: next.fresh },
    ]);
  }, [nextPhoto]);

  // Load and keep polling. New photos jump the queue; links are refreshed each time.
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch(`/api/events/${eventId}/slideshow`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { photos: Photo[] };
        const incoming = new Map(body.photos.map((p) => [p.id, p]));
        if (!firstLoad.current) {
          const added = body.photos
            .filter((p) => !photos.current.has(p.id))
            .map((p) => p.id);
          // Oldest new photo first, so they play in the order they were taken.
          fresh.current.push(...added.reverse());
        }
        photos.current = incoming;
        setCount(incoming.size);
        setOffline(false);
        if (firstLoad.current) {
          firstLoad.current = false;
          if (incoming.size) void advance();
        } else if (!shownId.current && incoming.size) {
          void advance();
        }
      } catch {
        setOffline(true);
      } finally {
        if (!stop) timer = setTimeout(load, POLL_MS);
      }
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [eventId, advance]);

  // Slide timer.
  useEffect(() => {
    if (paused || !slides.length) return;
    const t = setTimeout(() => void advance(), speed * 1000);
    return () => clearTimeout(t);
  }, [paused, speed, slides, advance]);

  // Keep the screen awake while the slideshow is open.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = await navigator.wakeLock?.request("screen");
      } catch {
        /* not supported or refused */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  // Hide the controls and cursor when the mouse is still.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setChrome(true);
      clearTimeout(t);
      t = setTimeout(() => setChrome(false), 3000);
    };
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("touchstart", wake);
    window.addEventListener("keydown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("touchstart", wake);
      window.removeEventListener("keydown", wake);
    };
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  // Keyboard: space pauses, right arrow skips, F fullscreen, Q toggles the code.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowRight") void advance();
      else if (e.key.toLowerCase() === "f") toggleFullscreen();
      else if (e.key.toLowerCase() === "q") setShowQr((q) => !q);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, toggleFullscreen]);

  const current = slides[slides.length - 1];
  const empty = count === 0;
  const host = guestUrl.replace(/^https?:\/\//, "");

  return (
    <main
      className={cx(
        "fixed inset-0 overflow-hidden bg-[#0b0b0c] text-cream select-none",
        !chrome && "cursor-none",
      )}
      aria-label={`Slideshow for ${title}`}
    >
      {/* Photos: each slide fades in over the last one. */}
      {slides.map((s) => (
        <div key={s.key} className="slide absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.photo.url}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-110 object-cover opacity-45 blur-3xl"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.photo.url}
            alt="Event photo"
            className="drift absolute inset-0 size-full object-contain"
            style={{ animationDuration: `${speed + 2}s` }}
          />
        </div>
      ))}

      {/* Nothing yet */}
      {empty && (
        <div className="absolute inset-0 grid place-items-center p-10">
          <div className="flex flex-col items-center gap-8 text-center">
            <p className="display text-[clamp(40px,6vw,96px)] leading-none">
              {title}
            </p>
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qr}
                alt="QR code to join"
                className="size-[min(38vh,380px)] rounded-3xl bg-white p-4"
              />
            )}
            <p className="max-w-[24ch] text-[clamp(20px,2.4vw,34px)] leading-tight text-cream-dim">
              No photos yet. Scan to grab a camera and take the first one.
            </p>
          </div>
        </div>
      )}

      {count === null && (
        <div className="absolute inset-0 grid place-items-center text-xl text-cream-dim">
          Loading the roll…
        </div>
      )}

      {/* Bottom bar: title, count and the join code */}
      {!empty && count !== null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-[3vw] pt-24 pb-[3vh]">
          <div className="min-w-0">
            {current?.fresh && (
              <span
                key={current.key}
                className="new-badge mb-3 inline-block rounded-full bg-flash px-4 py-1.5 text-[clamp(14px,1.3vw,20px)] font-bold text-ink"
              >
                Just taken
              </span>
            )}
            <p className="display truncate text-[clamp(28px,3.4vw,56px)] leading-none">
              {title}
            </p>
            <p className="mt-2 text-[clamp(15px,1.4vw,22px)] text-cream-dim numeric">
              {count} {count === 1 ? "photo" : "photos"} on the roll
            </p>
          </div>
          {showQr && qr && (
            <div className="flex shrink-0 items-center gap-4 rounded-3xl bg-white p-3 pr-6 text-ink shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR code to join"
                className="size-[clamp(96px,11vw,170px)]"
              />
              <div className="max-w-[15ch]">
                <p className="display text-[clamp(18px,1.8vw,30px)] leading-[1.05]">
                  Scan for a camera
                </p>
                <p className="mt-1.5 text-[clamp(12px,1vw,16px)] text-graphite">
                  {shots} shots each. No app needed.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Controls, shown while the mouse moves */}
      <div
        className={cx(
          "absolute top-0 right-0 left-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-[3vw] pt-[2.5vh] pb-10 transition-opacity duration-300",
          chrome ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Link
          href={`/dashboard/events/${eventId}`}
          className="rounded-full bg-white/10 px-4 py-2 font-semibold backdrop-blur hover:bg-white/20"
        >
          Exit
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {offline && (
            <span className="rounded-full bg-signal px-3 py-1.5 text-sm font-semibold text-white">
              Reconnecting…
            </span>
          )}
          <div
            className="flex rounded-full bg-white/10 p-1 backdrop-blur"
            role="group"
            aria-label="Seconds per photo"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  speed === s ? "bg-cream text-ink" : "hover:bg-white/10",
                )}
              >
                {s}s
              </button>
            ))}
          </div>
          <CtlButton onClick={() => setPaused((p) => !p)}>
            {paused ? "Play" : "Pause"}
          </CtlButton>
          <CtlButton onClick={() => void advance()}>Next</CtlButton>
          <CtlButton onClick={() => setShowQr((q) => !q)}>
            {showQr ? "Hide code" : "Show code"}
          </CtlButton>
          <CtlButton onClick={toggleFullscreen} primary>
            Full screen
          </CtlButton>
        </div>
      </div>

      {chrome && !empty && (
        <p className="pointer-events-none absolute top-[11vh] right-[3vw] text-right text-xs text-cream-dim">
          Space to pause, → to skip, F for full screen
          <br />
          Join link: {host}
        </p>
      )}
    </main>
  );
}

function CtlButton({
  onClick,
  children,
  primary,
}: {
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full px-4 py-2 font-semibold backdrop-blur",
        primary
          ? "bg-flash text-ink hover:brightness-95"
          : "bg-white/10 hover:bg-white/20",
      )}
    >
      {children}
    </button>
  );
}
