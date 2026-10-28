"use client";

import { useEffect, useRef, useState } from "react";

const COLOURS = ["#ffd23f", "#ff8a2b", "#2546d8", "#f1ecdf", "#c9372c", "#1f7a4d", "#7a5a3a", "#e3e8fb"];
const INK = ["#16171a", "#16171a", "#ffffff", "#16171a", "#ffffff", "#ffffff", "#ffffff", "#16171a"];

function short(s: string) {
  const words = s.split(/\s+/);
  const out = words.slice(0, 3).join(" ");
  return out.length > 22 ? `${out.slice(0, 21)}…` : words.length > 3 ? `${out}…` : out;
}

/**
 * Full-screen spin wheel for the mystery shot. The result is decided by the
 * server (it's the guest's own challenge), so the wheel just animates to it.
 */
export function MysteryWheel({
  slices,
  winner,
  onDone,
}: {
  slices: string[];
  winner: number;
  onDone: () => void;
}) {
  const [angle, setAngle] = useState(0);
  const [phase, setPhase] = useState<"ready" | "spinning" | "done">("ready");
  const button = useRef<HTMLButtonElement>(null);
  const n = slices.length;
  const slice = 360 / n;
  const R = 150;

  useEffect(() => {
    button.current?.focus();
  }, []);

  // Which slice is under the pointer (at the top) for a given rotation.
  const underPointer = (a: number) => Math.floor((((-a % 360) + 360) % 360) / slice) % n;
  const current = underPointer(angle);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  function spin() {
    if (phase !== "ready") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // Land the winner's slice under the pointer at the top, with a little wobble inside the slice.
    const wobble = (Math.random() - 0.5) * slice * 0.5;
    const target = 360 * (reduce ? 1 : 10) - ((winner + 0.5) * slice + wobble);
    const duration = reduce ? 600 : 4600;
    setPhase("spinning");
    navigator.vibrate?.(20);
    const t0 = performance.now();
    let last = underPointer(0);
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      // Fast start, long slow finish.
      const eased = 1 - Math.pow(1 - t, 4);
      const a = target * eased;
      setAngle(a);
      const idx = underPointer(a);
      if (idx !== last) {
        last = idx;
        // A light tick as each slice passes the pointer, once it's slow enough to feel.
        if (t > 0.55) navigator.vibrate?.(4);
      }
      if (t < 1) raf.current = requestAnimationFrame(frame);
      else {
        setPhase("done");
        navigator.vibrate?.([30, 40, 30]);
      }
    };
    raf.current = requestAnimationFrame(frame);
  }

  const point = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return [R + r * Math.cos(rad), R + r * Math.sin(rad)];
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mystery shot challenge wheel"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-body/95 px-5 text-cream backdrop-blur"
    >
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-flash uppercase">Mystery shot</p>
        <h2 className="display mt-1 text-[clamp(28px,8vw,40px)]">
          {phase === "done" ? "Your challenge" : "Spin for your challenge"}
        </h2>
      </div>

      <div className="relative w-[min(78vw,340px)]">
        {/* Pointer */}
        <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2" aria-hidden>
          <div className="h-0 w-0 border-x-[14px] border-t-[22px] border-x-transparent border-t-cream drop-shadow" />
        </div>
        <svg
          viewBox={`0 0 ${R * 2} ${R * 2}`}
          className="block w-full drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
          style={{ transform: `rotate(${angle}deg)` }}
          aria-hidden
        >
          {slices.map((s, i) => {
            const a0 = i * slice;
            const a1 = (i + 1) * slice;
            const [x0, y0] = point(a0, R);
            const [x1, y1] = point(a1, R);
            const mid = a0 + slice / 2;
            const [tx, ty] = point(mid, R * 0.6);
            return (
              <g key={i}>
                <path
                  d={`M${R},${R} L${x0},${y0} A${R},${R} 0 ${slice > 180 ? 1 : 0} 1 ${x1},${y1} Z`}
                  fill={COLOURS[i % COLOURS.length]}
                  stroke="#16171a"
                  strokeWidth="2"
                />
                <text
                  x={tx}
                  y={ty}
                  fill={INK[i % INK.length]}
                  fontSize={n > 6 ? 10 : 12}
                  fontWeight={700}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${mid - 90} ${tx} ${ty})`}
                >
                  {short(s)}
                </text>
              </g>
            );
          })}
          <circle cx={R} cy={R} r={22} fill="#16171a" stroke="#f1ecdf" strokeWidth="3" />
        </svg>
      </div>

      <div className="flex min-h-40 w-full max-w-sm flex-col items-center gap-4 text-center" aria-live="polite">
        {phase === "spinning" ? (
          <>
            <p className="flex min-h-[3.5em] items-center text-[20px] leading-snug font-bold text-cream" aria-hidden>
              {slices[current]}
            </p>
            <p className="text-cream-dim">Spinning…</p>
          </>
        ) : phase === "done" ? (
          <>
            <p className="develop-in text-[22px] leading-snug font-bold text-flash">{slices[winner]}</p>
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-full bg-flash px-6 py-3.5 text-lg font-bold text-body"
            >
              Take the shot
            </button>
          </>
        ) : (
          <>
            <p className="text-cream-dim">You&apos;ve got one extra shot. Spin to find out what to photograph.</p>
            <button
              ref={button}
              type="button"
              onClick={spin}
              className="w-full rounded-full bg-flash px-6 py-3.5 text-lg font-bold text-body disabled:opacity-60"
            >
              Spin
            </button>
          </>
        )}
      </div>
    </div>
  );
}
