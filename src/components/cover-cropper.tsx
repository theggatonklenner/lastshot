"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sourceSize } from "@/lib/client/image";
import { Button } from "@/components/ui";

type Src = ImageBitmap | HTMLImageElement;
export type CropView = { zoom: number; x: number; y: number; rotation: number };

const ASPECT = 3 / 2;
const OUT_W = 1800;
const OUT_H = 1200;
/** Roughly what a phone shows of the cover at the top of the guest page. */
const PHONE_ASPECT = 1.3;

/** Draws the image into a W x H box with the given zoom, pan (fractions of the box) and rotation. */
function draw(ctx: CanvasRenderingContext2D, src: Src, W: number, H: number, v: CropView) {
  const { w: iw, h: ih } = sourceSize(src);
  const turned = v.rotation % 180 !== 0;
  const rw = turned ? ih : iw;
  const rh = turned ? iw : ih;
  const scale = Math.max(W / rw, H / rh) * v.zoom;
  ctx.fillStyle = "#1d1e21";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 + v.x * W, H / 2 + v.y * H);
  ctx.rotate((v.rotation * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, -iw / 2, -ih / 2);
  ctx.restore();
}

/** Keeps the image covering the whole frame. */
function clamp(src: Src, v: CropView): CropView {
  const { w: iw, h: ih } = sourceSize(src);
  const turned = v.rotation % 180 !== 0;
  const rw = turned ? ih : iw;
  const rh = turned ? iw : ih;
  // Work in a 1 x (1/ASPECT) box: how far past the frame the image reaches on each side.
  const W = 1;
  const H = 1 / ASPECT;
  const scale = Math.max(W / rw, H / rh) * v.zoom;
  const maxX = Math.max(0, (rw * scale - W) / 2) / W;
  const maxY = Math.max(0, (rh * scale - H) / 2) / H;
  return { ...v, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
}

/**
 * Drag to move, pinch or use the slider to zoom, and rotate. Produces the
 * 1800 x 1200 cover that's uploaded.
 */
export function CoverCropper({
  src,
  busy,
  onCancel,
  onSave,
}: {
  src: Src;
  busy?: boolean;
  onCancel: () => void;
  onSave: (cover: Blob) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<CropView>({ zoom: 1, x: 0, y: 0, rotation: 0 });
  const [showGuide, setShowGuide] = useState(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  const update = useCallback((fn: (v: CropView) => CropView) => setView((v) => clamp(src, fn(v))), [src]);

  // Redraw the preview whenever the view or the box size changes.
  useEffect(() => {
    const el = canvas.current;
    const wrap = box.current;
    if (!el || !wrap) return;
    const paint = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(wrap.clientWidth * dpr);
      const H = Math.round(W / ASPECT);
      if (el.width !== W || el.height !== H) {
        el.width = W;
        el.height = H;
      }
      draw(el.getContext("2d")!, src, W, H, view);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [src, view]);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !box.current) return;
    const next = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, next);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.min(4, Math.max(1, (pinch.current.zoom * d) / pinch.current.dist));
      update((v) => ({ ...v, zoom }));
      return;
    }
    const W = box.current.clientWidth;
    const H = W / ASPECT;
    update((v) => ({ ...v, x: v.x + (next.x - prev.x) / W, y: v.y + (next.y - prev.y) / H }));
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  }

  function onKey(e: React.KeyboardEvent) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      update((v) => ({ ...v, x: v.x + m[0], y: v.y + m[1] }));
    } else if (e.key === "+" || e.key === "=") {
      update((v) => ({ ...v, zoom: Math.min(4, v.zoom + 0.1) }));
    } else if (e.key === "-") {
      update((v) => ({ ...v, zoom: Math.max(1, v.zoom - 0.1) }));
    }
  }

  async function save() {
    const out = document.createElement("canvas");
    out.width = OUT_W;
    out.height = OUT_H;
    draw(out.getContext("2d")!, src, OUT_W, OUT_H, view);
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.86));
    if (blob) onSave(blob);
  }

  const guideW = (PHONE_ASPECT / ASPECT) * 100;

  return (
    <div className="flex w-full max-w-lg flex-col gap-4">
      <div
        ref={box}
        tabIndex={0}
        role="application"
        aria-label="Cover crop. Drag or use the arrow keys to move, plus and minus to zoom."
        onKeyDown={onKey}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={(e) => update((v) => ({ ...v, zoom: Math.min(4, Math.max(1, v.zoom - e.deltaY * 0.002)) }))}
        className="relative aspect-[3/2] w-full cursor-grab touch-none overflow-hidden rounded-panel border border-line bg-body select-none active:cursor-grabbing"
      >
        <canvas ref={canvas} className="block size-full" />
        {/* Rule of thirds */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="border-[0.5px] border-white/25" />
          ))}
        </div>
        {showGuide && (
          <div
            className="pointer-events-none absolute inset-y-0 border-x-2 border-dashed border-flash/90"
            style={{ left: `${(100 - guideW) / 2}%`, width: `${guideW}%` }}
            aria-hidden
          >
            <span className="absolute top-2 left-2 rounded bg-body/80 px-1.5 py-0.5 text-xs font-semibold text-flash">
              Phones show this part
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-3 text-sm font-semibold">
          <span className="w-12">Zoom</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={view.zoom}
            onChange={(e) => update((v) => ({ ...v, zoom: Number(e.target.value) }))}
            className="flex-1 accent-cobalt"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => update((v) => ({ ...v, rotation: (v.rotation + 90) % 360 }))}>
            Rotate
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setView({ zoom: 1, x: 0, y: 0, rotation: view.rotation })}>
            Reset
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowGuide(!showGuide)} aria-pressed={showGuide}>
            {showGuide ? "Hide phone guide" : "Show phone guide"}
          </Button>
        </div>
        <p className="text-sm text-graphite">Drag the photo to move it. Pinch, scroll or use the slider to zoom.</p>
        <div className="flex gap-2">
          <Button type="button" onClick={save} pending={busy}>
            Save cover
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
