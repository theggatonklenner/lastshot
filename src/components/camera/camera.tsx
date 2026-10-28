"use client";

import { filmLook, withLook } from "@/lib/themes";
import type { FilmLookId } from "@/lib/database.types";
import { MysteryWheel } from "./mystery-wheel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CameraTheme } from "@/lib/themes";
import { develop, type PhotoFrame } from "@/lib/client/develop";
import { guestToken } from "@/lib/client/upload-queue";
import { decodeFile } from "@/lib/client/image";
import { useUploadQueue } from "@/lib/client/upload-queue";
import { counterText } from "@/lib/rules";
import { cx } from "@/components/ui";

type Phase = "idle" | "starting" | "live" | "denied" | "unsupported" | "error";
type Facing = "environment" | "user";

export type CameraProps = {
  code: string;
  title: string;
  theme: CameraTheme;
  dateStamp: boolean;
  frame?: PhotoFrame | null;
  limit: number;
  retakesLeft?: number;
  /** Mystery shot prompt, once it has unlocked. */
  mysteryPrompt?: string | null;
  /** Slices for the spin wheel, with the guest's own challenge at `winner`. */
  mysteryWheel?: { slices: string[]; winner: number } | null;
  initialUsed: number;
  allowLibrary: boolean;
  /** Film looks guests can pick per shot (empty: the event's style only). */
  looks?: FilmLookId[];
  demo?: boolean;
  exitHref: string;
  doneHref: string;
};

const noopSubscribe = () => () => {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Camera(props: CameraProps) {
  const { code, title, theme: eventTheme, dateStamp, frame, initialUsed, allowLibrary, demo, exitHref, doneHref } = props;
  const looks = props.looks ?? [];
  const [look, setLook] = useState<FilmLookId | null>(null);
  const theme = withLook(eventTheme, look);
  const lookCss = look ? (filmLook(look)?.css ?? "none") : "none";
  const [limit, setLimit] = useState(props.limit);
  const [retakesLeft, setRetakesLeft] = useState(props.retakesLeft ?? 0);
  const [mystery, setMystery] = useState<string | null>(props.mysteryPrompt ?? null);
  const [wheel, setWheel] = useState(props.mysteryWheel ?? null);
  const [wheelOpen, setWheelOpen] = useState(false);
  const wheelKey = `lastshot:wheel:${code}`;
  // Read after hydration so the server and browser render the same thing first.
  const spunBefore = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(wheelKey) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [spunNow, setSpun] = useState(false);
  const spun = spunBefore || spunNow;
  const [retaking, setRetaking] = useState(false);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [facing, setFacing] = useState<Facing>("environment");
  const [canFlip, setCanFlip] = useState(false);
  const [flash, setFlash] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [demoShots, setDemoShots] = useState<string[]>([]);
  // Flash (phone torch on the back camera, a white screen on the front), selfie timer and the last-shot moment.
  const [flashOn, setFlashOn] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [timerOn, setTimerOn] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastMoment, setLastMoment] = useState(false);

  const queue = useUploadQueue({ code, initialUsed, demo });
  const remaining = Math.max(0, limit - queue.used - queue.items.length);

  // Bonus and mystery shots can unlock while the camera is open, so check in now and then.
  useEffect(() => {
    if (demo) return;
    const check = async () => {
      try {
        const token = guestToken(code);
        const res = await fetch(`/api/e/${code}/me`, { headers: token ? { "x-lastshot-guest": token } : {}, cache: "no-store" });
        const j = await res.json();
        if (!j.guest) return;
        setLimit(j.guest.shotsLimit);
        setRetakesLeft(j.guest.retakesLeft ?? 0);
        setMystery(j.guest.mystery ?? null);
        setWheel(j.guest.mysteryWheel ?? null);
      } catch {
        /* offline: try again later */
      }
    };
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [code, demo]);

  async function retake() {
    if (retaking) return;
    setRetaking(true);
    setLocalError(null);
    try {
      const token = guestToken(code);
      const res = await fetch(`/api/e/${code}/retake`, {
        method: "POST",
        headers: token ? { "x-lastshot-guest": token } : {},
      });
      const j = await res.json();
      if (!res.ok) {
        setLocalError(j.message ?? "That didn't work. Try again.");
        if (j.code === "no_retakes_left") setRetakesLeft(0);
        return;
      }
      queue.setUsed(j.shotsUsed);
      setLimit(j.shotsLimit);
      setRetakesLeft(j.retakesLeft);
      setLocalError("Last shot deleted. Take it again.");
    } catch {
      setLocalError("No connection. Try the retake again in a moment.");
    } finally {
      setRetaking(false);
    }
  }
  const canRetake = !demo && retakesLeft > 0 && queue.used > 0 && queue.items.length === 0;
  const rollFinished = remaining === 0 && queue.items.length === 0 && queue.loaded;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (want: Facing = facing) => {
      setLocalError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setPhase("unsupported");
        return;
      }
      setPhase("starting");
      stop();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: want }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await v.play().catch(() => {});
        }
        setFacing(want);
        setPhase("live");
        const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchOk(!!caps?.torch);
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : "";
        setPhase(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "error");
      }
    },
    [facing, stop],
  );

  // Release the camera when the page is hidden; resume when it comes back.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (streamRef.current) {
          stop();
          setPhase("idle");
        }
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [stop]);

  // Finished roll: everything confirmed by the server.
  useEffect(() => {
    if (!rollFinished || demo) return;
    stop();
    // Give the last-shot moment time to play before moving on.
    const t = setTimeout(() => router.push(doneHref), lastMoment ? 3200 : 900);
    return () => clearTimeout(t);
  }, [rollFinished, demo, doneHref, router, stop, lastMoment]);

  // In the demo (no redirect), let the last-shot moment fade after a few seconds.
  useEffect(() => {
    if (!lastMoment || !demo) return;
    const t = setTimeout(() => setLastMoment(false), 3200);
    return () => clearTimeout(t);
  }, [lastMoment, demo]);

  async function setTorch(on: boolean) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return false;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      return true;
    } catch {
      return false;
    }
  }

  async function shoot() {
    const v = videoRef.current;
    if (!v || phase !== "live" || processing || remaining <= 0) return;
    setProcessing(true);
    const isLast = remaining === 1;
    let torchUsed = false;
    try {
      if (timerOn) {
        for (let n = 3; n >= 1; n--) {
          setCountdown(n);
          navigator.vibrate?.(8);
          await sleep(1000);
        }
        setCountdown(null);
      }
      if (flashOn) {
        if (facing === "user") {
          // Front camera: light the face with a bright white screen.
          setScreenFlash(true);
          await sleep(380);
        } else if (torchOk) {
          torchUsed = await setTorch(true);
          // Give the camera a moment to adjust to the light.
          if (torchUsed) await sleep(550);
        }
      }
      setFlash((n) => n + 1);
      if ("vibrate" in navigator) navigator.vibrate?.(12);
      // Let the flash paint before the heavy pixel work.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const aspect = v.clientWidth && v.clientHeight ? v.clientWidth / v.clientHeight : undefined;
      const blob = await develop(v, { theme, dateStamp, frame, mirror: facing === "user", aspect, lastShot: isLast });
      if (torchUsed) await setTorch(false);
      setScreenFlash(false);
      if (demo) setDemoShots((s) => [...s, URL.createObjectURL(blob)]);
      if (isLast) {
        setLastMoment(true);
        navigator.vibrate?.([40, 60, 40, 60, 120]);
      }
      await queue.enqueue(blob, "camera");
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "That shot didn't work. Try again.");
    } finally {
      if (torchUsed) await setTorch(false);
      setScreenFlash(false);
      setCountdown(null);
      setProcessing(false);
    }
  }

  async function fromFile(file: File | undefined, source: "camera" | "library") {
    if (!file || remaining <= 0) return;
    setProcessing(true);
    setLocalError(null);
    try {
      const img = await decodeFile(file);
      const isLast = remaining === 1;
      const blob = await develop(img, { theme, dateStamp, frame, when: new Date(file.lastModified || Date.now()), lastShot: isLast });
      if (isLast) setLastMoment(true);
      if (demo) setDemoShots((s) => [...s, URL.createObjectURL(blob)]);
      await queue.enqueue(blob, source);
    } catch {
      setLocalError("That photo couldn't be opened. Try a different one.");
    } finally {
      setProcessing(false);
      if (fallbackInput.current) fallbackInput.current.value = "";
      if (libraryInput.current) libraryInput.current.value = "";
    }
  }

  const ready = phase === "live" && !processing && remaining > 0;
  const noticeText = localError ?? queue.notice?.text ?? null;

  // One shot left: the whole camera turns gold.
  const goldMode = (remaining === 1 && phase !== "unsupported") || lastMoment;

  return (
    <div
      className={cx("plastic fixed inset-0 flex flex-col text-cream transition-[background] duration-700 select-none", goldMode && "gold-mode")}
      style={{
        ["--shell" as string]: goldMode ? "linear-gradient(135deg,#8f6a1f,#f6dc8a 40%,#d4a537 65%,#b8892b)" : theme.shell,
        ["--shell-solid" as string]: goldMode ? "#d4a537" : theme.shell,
      }}
    >
      {/* Top strip */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3">
        <Link href={exitHref} className="flex h-10 items-center rounded-full bg-cream/10 px-4 text-[15px] font-semibold" onClick={stop}>
          {demo ? "Exit" : "Event"}
        </Link>
        <p className="flex min-w-0 flex-1 items-center justify-center gap-2 text-[15px] font-semibold text-cream-dim">
          <span className="truncate">{title}</span>
          {demo && <span className="shrink-0 rounded-full bg-flash px-2 py-0.5 text-xs font-bold text-body">Demo</span>}
        </p>
        <span className="flex items-center gap-2 text-sm text-cream-dim" aria-live="polite">
          <span
            className={cx(
              "size-2.5 rounded-full transition-all",
              ready ? "bg-flash shadow-[0_0_10px_2px_rgb(255_210_63/0.7)]" : "bg-cream/25",
            )}
            aria-hidden
          />
          <span className="sr-only">{ready ? "Ready" : "Not ready"}</span>
        </span>
      </div>

      {/* Viewfinder in a moulded shell */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div
          className="relative h-full max-h-[calc(100vw*1.333)] w-full max-w-[calc((100dvh-260px)*0.75)] rounded-[22px] p-2.5 shadow-[inset_0_2px_0_rgb(255_255_255/0.12),0_18px_40px_-20px_rgb(0_0_0/0.8)]"
          style={{ background: "var(--shell)" }}
        >
          <div className="grain relative size-full overflow-hidden rounded-[14px] bg-black">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={cx("absolute inset-0 size-full object-cover", facing === "user" && "-scale-x-100", phase !== "live" && "opacity-0")}
              style={lookCss !== "none" ? { filter: lookCss } : undefined}
            />
            {/* film frame marks */}
            <div className="pointer-events-none absolute inset-3 z-[2] rounded-[6px] border border-cream/25" />
            <span className="pointer-events-none absolute top-4 left-5 z-[2] text-xs font-semibold tracking-wide text-cream/60">
              {counterText(limit - remaining + 1 > limit ? limit : limit - remaining + 1)}A
            </span>

            {(phase !== "live" || remaining <= 0) && !lastMoment && (
              <ViewfinderMessage
                phase={phase}
                remaining={remaining}
                onStart={() => start()}
                onFallback={() => fallbackInput.current?.click()}
                rollFinished={rollFinished}
                demo={demo}
              />
            )}
            {flash > 0 && <div key={flash} className="flash-bloom pointer-events-none absolute inset-0 z-[3] bg-white" />}

            {phase === "live" && remaining > 0 && (
              <div className="absolute top-3 right-3 z-[4] flex gap-2">
                {(torchOk || facing === "user") && (
                  <button
                    type="button"
                    onClick={() => setFlashOn(!flashOn)}
                    aria-pressed={flashOn}
                    aria-label={flashOn ? "Flash on" : "Flash off"}
                    className={cx(
                      "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold backdrop-blur",
                      flashOn ? "bg-flash text-body" : "bg-black/45 text-cream",
                    )}
                  >
                    <BoltIcon />
                    {flashOn ? "On" : "Off"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTimerOn(!timerOn)}
                  aria-pressed={timerOn}
                  aria-label={timerOn ? "3 second timer on" : "Timer off"}
                  className={cx(
                    "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold backdrop-blur",
                    timerOn ? "bg-flash text-body" : "bg-black/45 text-cream",
                  )}
                >
                  <TimerIcon />
                  {timerOn ? "3s" : "Off"}
                </button>
              </div>
            )}

            {countdown !== null && (
              <div className="pointer-events-none absolute inset-0 z-[4] flex items-center justify-center" aria-live="assertive">
                <span key={countdown} className="countdown-pop display text-[140px] leading-none text-cream drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
                  {countdown}
                </span>
              </div>
            )}

            {lastMoment && (
              <div className="last-shot-moment pointer-events-none absolute inset-0 z-[5] flex flex-col items-center justify-center gap-3 text-center">
                <span className="rounded-[8px] bg-[linear-gradient(120deg,#b8892b,#f6dc8a_45%,#d4a537)] px-4 py-1.5 text-sm font-extrabold tracking-[0.2em] text-body uppercase shadow-lg">
                  Last shot
                </span>
                <p className="display px-6 text-[clamp(30px,9vw,44px)] text-cream drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
                  That&apos;s the roll
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {looks.length > 0 && remaining > 0 && (
        <div className="mx-4 mt-3 -mb-1 overflow-x-auto" role="radiogroup" aria-label="Film look">
          <div className="flex min-w-max gap-2">
            {[null, ...looks].map((id) => {
              const on = look === id;
              return (
                <button
                  key={id ?? "event"}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setLook(id)}
                  className={cx(
                    "rounded-full border px-3 py-1.5 text-sm font-semibold whitespace-nowrap",
                    on ? "border-flash bg-flash text-body" : "border-cream/25 text-cream-dim hover:text-cream",
                  )}
                >
                  {id ? filmLook(id)?.name : "Event style"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mystery && remaining > 0 && wheel && !spun ? (
        <button
          type="button"
          onClick={() => setWheelOpen(true)}
          className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[14px] bg-flash px-4 py-2.5 text-left text-body"
        >
          <span>
            <span className="block text-xs font-bold tracking-wide uppercase">Mystery shot unlocked</span>
            <span className="text-[15px] leading-snug font-semibold">Spin the wheel for your challenge</span>
          </span>
          <span className="shrink-0 rounded-full bg-body px-3 py-1 text-sm font-bold text-flash">Spin</span>
        </button>
      ) : mystery && remaining > 0 ? (
        <div className="mx-4 mt-3 flex items-center gap-3 rounded-[14px] bg-flash px-4 py-2.5 text-body">
          <span className="text-xs font-bold tracking-wide uppercase">Mystery shot</span>
          <span className="text-[15px] leading-snug font-semibold">{mystery}</span>
        </div>
      ) : null}
      {screenFlash && <div className="pointer-events-none fixed inset-0 z-[60] bg-white" aria-hidden />}
      {wheelOpen && wheel && (
        <MysteryWheel
          slices={wheel.slices}
          winner={wheel.winner}
          onDone={() => {
            setWheelOpen(false);
            setSpun(true);
            try {
              localStorage.setItem(wheelKey, "1");
            } catch {
              /* private mode: they'll just see the challenge text */
            }
          }}
        />
      )}

      {/* Status line */}
      <div className="flex min-h-12 items-center justify-center px-5 pt-3 text-center text-[15px]" aria-live="polite">
        {noticeText ? (
          <span className="text-flash">{noticeText}</span>
        ) : queue.failedCount > 0 ? (
          <button onClick={queue.retryAll} className="font-semibold text-flash underline underline-offset-4">
            {queue.failedCount === 1 ? "1 photo" : `${queue.failedCount} photos`} didn&apos;t send. Tap to retry.
          </button>
        ) : queue.uploading ? (
          <span className="text-cream-dim">
            Sending{queue.items.length > 1 ? ` ${queue.items.length} photos` : ""}
            <span className="numeric"> {Math.round(queue.uploading.progress * 100)}%</span>
          </span>
        ) : queue.items.some((i) => i.state === "failed") ? (
          <span className="text-cream-dim">No connection. Your photos are safe and will send when you&apos;re back online.</span>
        ) : queue.justSaved ? (
          <span className="text-cream">{demo ? "Developed. Demo shots stay on this phone." : "Saved to the event"}</span>
        ) : canRetake && remaining === 0 ? (
          <button onClick={retake} disabled={retaking} className="font-semibold text-flash underline underline-offset-4">
            {retaking ? "Deleting…" : "Blinked? Retake your last shot"}
          </button>
        ) : rollFinished ? (
          <span className="text-cream">That&apos;s the roll. Every photo is saved.</span>
        ) : canRetake ? (
          <span className="flex items-center gap-3 text-cream-dim">
            Make it count
            <button onClick={retake} disabled={retaking} className="font-semibold text-cream underline underline-offset-4">
              {retaking ? "Deleting…" : "Retake last"}
            </button>
          </span>
        ) : remaining === 1 ? (
          <span className="font-semibold text-[#f6dc8a]">Last shot. This one comes out with a gold border.</span>
        ) : (
          <span className="text-cream-dim">{remaining === 0 ? "Finishing up" : "Make it count"}</span>
        )}
      </div>

      {/* Controls: thumb zone */}
      <div className="grid grid-cols-3 items-center px-6 pt-2 pb-[max(22px,env(safe-area-inset-bottom))]">
        <div className="flex justify-start">
          {phase === "live" && canFlip ? (
            <button
              onClick={() => start(facing === "user" ? "environment" : "user")}
              className="flex size-14 items-center justify-center rounded-full bg-cream/10 hover:bg-cream/20"
              aria-label={facing === "user" ? "Switch to back camera" : "Switch to front camera"}
            >
              <FlipIcon />
            </button>
          ) : allowLibrary ? (
            <LibraryButton onClick={() => libraryInput.current?.click()} disabled={remaining <= 0 || processing} />
          ) : (
            <span />
          )}
        </div>

        <div className="flex justify-center">
          <button
            onClick={phase === "live" ? shoot : () => start()}
            disabled={(phase === "live" && !ready) || remaining <= 0 || phase === "starting"}
            aria-label={phase === "live" ? `Take photo, ${remaining} left` : "Start camera"}
            className="group relative flex size-[84px] items-center justify-center rounded-full bg-cream/15 p-[6px] transition-transform active:scale-95 disabled:opacity-40"
          >
            <span className="size-full rounded-full border-[3px] border-body bg-cream shadow-[inset_0_-4px_0_rgb(0_0_0/0.15)] group-active:bg-cream-dim" />
          </button>
        </div>

        <div className="flex justify-end">
          <ShotCounter remaining={remaining} />
        </div>
      </div>

      {allowLibrary && phase === "live" && canFlip && (
        <div className="flex justify-center pb-[max(10px,env(safe-area-inset-bottom))]">
          <button
            onClick={() => libraryInput.current?.click()}
            disabled={remaining <= 0 || processing}
            className="text-sm font-semibold text-cream-dim underline underline-offset-4 disabled:opacity-40"
          >
            Add from photo library
          </button>
        </div>
      )}

      {demo && demoShots.length > 0 && (
        <div className="absolute right-4 bottom-36 left-4 flex justify-end gap-1.5">
          {demoShots.slice(-5).map((u) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" className="develop h-14 w-11 rounded-[4px] border-2 border-cream object-cover shadow-lg" />
          ))}
        </div>
      )}

      <input
        ref={fallbackInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => fromFile(e.target.files?.[0], "camera")}
      />
      <input
        ref={libraryInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => fromFile(e.target.files?.[0], "library")}
      />
    </div>
  );
}

function ViewfinderMessage({
  phase,
  remaining,
  onStart,
  onFallback,
  rollFinished,
  demo,
}: {
  demo?: boolean;
  phase: Phase;
  remaining: number;
  onStart: () => void;
  onFallback: () => void;
  rollFinished: boolean;
}) {
  const box = "absolute inset-0 z-[2] flex bg-body/80 flex-col items-center justify-center gap-4 p-8 text-center";
  if (remaining <= 0) {
    return (
      <div className={box}>
        <p className="display-md text-2xl">{rollFinished ? "Roll finished" : "Last photos sending"}</p>
        <p className="text-cream-dim">
          {rollFinished ? (demo ? "In a real event, every shot would now be in the shared gallery." : "Taking you to the gallery details.") : "Keep this page open for a moment."}
        </p>
      </div>
    );
  }
  if (phase === "starting") {
    return (
      <div className={box}>
        <p className="text-cream-dim">Opening the camera</p>
      </div>
    );
  }
  if (phase === "denied" || phase === "unsupported" || phase === "error") {
    const text =
      phase === "denied"
        ? "Camera access is turned off for this site. Allow it in your browser settings, or use your phone's camera app instead."
        : phase === "unsupported"
          ? "This browser can't open the camera here. Use your phone's camera app instead."
          : "The camera didn't start. Try again, or use your phone's camera app.";
    return (
      <div className={box}>
        <p className="max-w-[28ch] text-cream">{text}</p>
        <div className="flex flex-col gap-2">
          <button onClick={onFallback} className="h-12 rounded-full bg-cream px-6 font-semibold text-body">
            Use phone camera
          </button>
          {phase !== "unsupported" && (
            <button onClick={onStart} className="h-11 rounded-full px-6 font-semibold text-cream underline underline-offset-4">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="display-md text-3xl">Ready when you are</p>
      <p className="max-w-[26ch] text-cream-dim">
        Tap the shutter to open your camera. You have {remaining === 1 ? "1 shot" : `${remaining} shots`} on this roll.
      </p>
      <button onClick={onStart} className="h-12 rounded-full bg-flash px-7 font-bold text-body">
        Start camera
      </button>
    </div>
  );
}

/** The thumbwheel counter window. New numbers roll in from above. */
function ShotCounter({ remaining }: { remaining: number }) {
  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${remaining} shots left`} role="status">
      <div className="relative h-[52px] w-[64px] overflow-hidden rounded-[10px] bg-black shadow-[inset_0_3px_6px_rgb(0_0_0/0.8),0_0_0_3px_var(--shell-solid)]">
        <div key={remaining} className="counter-roll display numeric flex size-full items-center justify-center text-[30px] text-cream">
          {counterText(remaining)}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.55),transparent_30%,transparent_70%,rgb(0_0_0/0.55))]" />
      </div>
      <span className="text-xs font-semibold text-cream-dim">left</span>
    </div>
  );
}

function FlipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 21v-5h-5" />
    </svg>
  );
}

function LibraryButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex size-14 items-center justify-center rounded-full bg-cream/10 hover:bg-cream/20 disabled:opacity-40"
      aria-label="Add from photo library"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="9" cy="10" r="1.6" />
        <path d="m21 16-5-5-8 8" />
      </svg>
    </button>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </svg>
  );
}
