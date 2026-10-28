"use client";

import { useEffect, useRef, useState } from "react";
import { develop, drawFrame, renderLook, type PhotoFrame } from "@/lib/client/develop";
import { decodeFile } from "@/lib/client/image";
import { resolveTheme } from "@/lib/themes";
import { cx } from "@/components/ui";

/** Draws a warm party scene (string lights, people, a table) to show the film looks on. */
function drawSample(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 900;
  c.height = 1200;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, 1200);
  bg.addColorStop(0, "#2b2346");
  bg.addColorStop(0.55, "#7a4a5e");
  bg.addColorStop(1, "#d98c5f");
  g.fillStyle = bg;
  g.fillRect(0, 0, 900, 1200);
  // String lights
  for (let i = 0; i < 26; i++) {
    const x = 20 + i * 34;
    const y = 120 + Math.sin(i / 2.2) * 40;
    const r = g.createRadialGradient(x, y, 0, x, y, 46);
    r.addColorStop(0, "rgba(255,230,160,0.95)");
    r.addColorStop(0.25, "rgba(255,200,110,0.45)");
    r.addColorStop(1, "rgba(255,180,90,0)");
    g.fillStyle = r;
    g.fillRect(x - 46, y - 46, 92, 92);
  }
  // Soft bokeh
  const dots: [number, number, number, string][] = [
    [140, 380, 60, "rgba(255,160,120,0.25)"],
    [760, 330, 80, "rgba(140,170,255,0.2)"],
    [620, 520, 50, "rgba(255,220,140,0.25)"],
    [90, 640, 70, "rgba(255,120,170,0.2)"],
  ];
  for (const [x, y, rad, col] of dots) {
    g.fillStyle = col;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // Two people
  const person = (x: number, shirt: string, skin: string, hair: string, scale = 1) => {
    g.save();
    g.translate(x, 0);
    g.scale(scale, scale);
    g.fillStyle = shirt;
    g.beginPath();
    g.ellipse(0, 1060, 190, 320, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = skin;
    g.fillRect(-38, 640, 76, 90);
    g.beginPath();
    g.ellipse(0, 560, 105, 128, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hair;
    g.beginPath();
    g.ellipse(0, 488, 116, 82, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath();
    g.ellipse(-36, 530, 30, 40, -0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  person(300, "#2e6fd8", "#e7b48f", "#3a2418", 1.05);
  person(620, "#f2c94c", "#a8714f", "#1b1311", 0.98);
  // Table and glasses
  g.fillStyle = "#3b2418";
  g.fillRect(0, 1080, 900, 120);
  for (const x of [180, 450, 720]) {
    g.fillStyle = "rgba(255,240,210,0.55)";
    g.fillRect(x - 18, 990, 36, 90);
    g.fillStyle = "rgba(255,190,90,0.7)";
    g.fillRect(x - 15, 1030, 30, 48);
  }
  return c;
}

/**
 * Shows what a shot will look like with the chosen camera style, date stamp
 * and photo frame, using the same code the guests' cameras use.
 */
export function FilterPreview({
  themeId,
  accent,
  dateStamp,
  frame,
}: {
  themeId: string;
  accent: string;
  dateStamp: boolean;
  frame?: PhotoFrame | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [own, setOwn] = useState<ImageBitmap | HTMLImageElement | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const sample = useRef<ImageBitmap | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Compare the frame by value, so a parent re-render doesn't redraw the preview.
  const frameKey = frame && (frame.text || frame.subtext) ? JSON.stringify(frame) : "";

  // Live camera: draws the look onto a canvas several times a second.
  const [live, setLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const liveCanvas = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ themeId, accent, dateStamp, frameKey, showOriginal });
  useEffect(() => {
    settings.current = { themeId, accent, dateStamp, frameKey, showOriginal };
  }, [themeId, accent, dateStamp, frameKey, showOriginal]);

  useEffect(() => {
    if (!live) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 960 } }, audio: false });
      } catch {
        setLiveError("Couldn't open the camera. Check that this site is allowed to use it.");
        setLive(false);
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play().catch(() => {});
      await document.fonts?.load('800 40px "Archivo Variable"').catch(() => {});
      let last = 0;
      const tick = (t: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        // About 15 frames a second is plenty for a preview and easy on phones.
        if (t - last < 66 || !liveCanvas.current || video.readyState < 2) return;
        last = t;
        const st = settings.current;
        renderLook(
          video,
          {
            theme: resolveTheme(st.themeId, st.accent),
            dateStamp: st.dateStamp,
            frame: st.frameKey ? JSON.parse(st.frameKey) : null,
            aspect: 3 / 4,
            mirror: true,
            original: st.showOriginal,
          },
          480,
          liveCanvas.current,
        );
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [live]);

  useEffect(() => {
    const fr: PhotoFrame | null = frameKey ? JSON.parse(frameKey) : null;
    let cancelled = false;
    let made: string | null = null;
    (async () => {
      if (!own && !sample.current) sample.current = await createImageBitmap(drawSample());
      const src = own ?? sample.current!;
      await document.fonts?.load('800 40px "Archivo Variable"').catch(() => {});
      let blob: Blob;
      if (showOriginal) {
        const c = document.createElement("canvas");
        const w = "naturalWidth" in src ? src.naturalWidth : src.width;
        const h = "naturalHeight" in src ? src.naturalHeight : src.height;
        const k = Math.min(1, 900 / Math.max(w, h));
        c.width = Math.round(w * k);
        c.height = Math.round(h * k);
        c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
        const out = fr ? drawFrame(c, fr) : c;
        blob = await new Promise<Blob>((r) => out.toBlob((b) => r(b!), "image/jpeg", 0.85));
      } else {
        blob = await develop(src, { theme: resolveTheme(themeId, accent), dateStamp, frame: fr, aspect: 3 / 4, when: new Date() });
      }
      if (cancelled) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    })().catch(() => {});
    return () => {
      cancelled = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [themeId, accent, dateStamp, frameKey, own, showOriginal]);

  return (
    <div className="flex flex-col gap-3 rounded-control border border-line bg-card p-4 sm:flex-row sm:items-start sm:gap-5">
      <div className="relative w-full max-w-[220px] shrink-0 overflow-hidden rounded-[10px] bg-body sm:w-[200px]">
        {live ? (
          <canvas ref={liveCanvas} aria-label="Live preview from your camera" className="block h-auto w-full" />
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Preview of a photo with this camera style" className="block w-full" />
        ) : (
          <div className="aspect-[3/4] w-full animate-pulse bg-body-2" />
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <p className="font-semibold">Preview</p>
          <p className="text-sm text-graphite">
            This is how a guest&apos;s photo will come out, with{" "}
            {listParts(["the film look", dateStamp && "date stamp", !!frameKey && "frame"])}. It updates as you change
            the settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-line p-0.5" role="group" aria-label="Before or after">
            {[
              [false, "With style"],
              [true, "Original"],
            ].map(([v, label]) => (
              <button
                key={String(label)}
                type="button"
                aria-pressed={showOriginal === v}
                onClick={() => setShowOriginal(v as boolean)}
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  showOriginal === v ? "bg-ink text-paper" : "text-graphite hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setLiveError(null);
              setLive(!live);
            }}
            aria-pressed={live}
            className={cx(
              "rounded-full border px-3 py-1 text-sm font-semibold",
              live ? "border-signal bg-signal text-white" : "border-line hover:border-ink/40",
            )}
          >
            {live ? "Stop camera" : "Use my camera"}
          </button>
          <button
            type="button"
            onClick={() => {
              setLive(false);
              input.current?.click();
            }}
            className="rounded-full border border-line px-3 py-1 text-sm font-semibold hover:border-ink/40"
          >
            {own ? "Try another photo" : "Try with your own photo"}
          </button>
          {own && !live && (
            <button type="button" onClick={() => setOwn(null)} className="px-2 text-sm font-semibold text-graphite hover:text-ink">
              Use sample
            </button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setOwn(await decodeFile(f).catch(() => null));
              e.target.value = "";
            }}
          />
        </div>
        {liveError && <p className="text-sm text-signal">{liveError}</p>}
        <p className="text-xs text-graphite">
          {live ? "Live from your camera. Nothing is recorded or uploaded." : "Your photo stays on this device. It isn't uploaded."}
        </p>
      </div>
    </div>
  );
}

function listParts(parts: (string | false)[]) {
  const p = parts.filter(Boolean) as string[];
  return p.length <= 1 ? p.join("") : `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`;
}
