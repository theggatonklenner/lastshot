"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ to, onDone, className }: { to: string; onDone?: () => void; className?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = target - now;
  useEffect(() => {
    if (left <= 0) onDone?.();
  }, [left <= 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = parts(left);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={className} suppressHydrationWarning>
      {p.d > 0 ? `${p.d}d ` : ""}
      {pad(p.h)}:{pad(p.m)}:{pad(p.s)}
    </span>
  );
}
