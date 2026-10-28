"use client";

import type { CameraTheme } from "@/lib/themes";
import { canvasToJpeg, fitWithin, sourceSize } from "@/lib/client/image";

const MAX_SIDE = 2400;
const MAX_BYTES = 3.5 * 1024 * 1024;

type Source = HTMLVideoElement | ImageBitmap | HTMLImageElement;

/** Photo-lab style date imprint, e.g. '26 10 28 */
export function stampText(d = new Date()) {
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, " ");
  const dd = String(d.getDate()).padStart(2, "0");
  return `'${yy} ${mm.trim().padStart(2, "0")} ${dd}`;
}

function clamp(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Per-pixel film look. Done by hand because canvas filters aren't available on every iPhone. */
function applyLook(ctx: CanvasRenderingContext2D, w: number, h: number, theme: CameraTheme) {
  if (theme.filter === "none" && theme.grain === 0 && theme.vignette === 0) return;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const grainAmt = theme.grain * 26;
  const vig = theme.vignette;

  // Lookup tables keep the loop cheap.
  const curve = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let v = i;
    if (theme.filter === "classic") {
      v = (i - 128) * 1.1 + 128; // contrast
      v = v + 6; // brighter, like a flash snapshot
    } else if (theme.filter === "vintage") {
      v = 26 + i * 0.86; // faded blacks, soft highlights
    }
    curve[i] = clamp(v);
  }

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = curve[d[i]];
      let g = curve[d[i + 1]];
      let b = curve[d[i + 2]];

      if (theme.filter === "classic") {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * 1.18 + 7;
        g = l + (g - l) * 1.18 + 1;
        b = l + (b - l) * 1.18 - 8;
      } else if (theme.filter === "vintage") {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        const sr = l * 1.07 + 18;
        const sg = l * 0.98 + 6;
        const sb = l * 0.82;
        r = r * 0.62 + sr * 0.38;
        g = g * 0.62 + sg * 0.38;
        b = b * 0.62 + sb * 0.38;
      }

      if (vig > 0) {
        const dx = x - cx;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const f = 1 - vig * Math.max(0, dist - 0.45) * 1.6;
        r *= f;
        g *= f;
        b *= f;
      }

      if (grainAmt > 0) {
        const n = (Math.random() - 0.5) * grainAmt;
        r += n;
        g += n;
        b += n;
      }

      d[i] = clamp(r);
      d[i + 1] = clamp(g);
      d[i + 2] = clamp(b);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, when: Date) {
  const size = Math.round(Math.min(w, h) * 0.042);
  ctx.save();
  ctx.font = `700 ${size}px "Archivo Variable", ui-monospace, monospace`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ff8a2b";
  ctx.shadowColor = "rgba(255, 120, 30, 0.85)";
  ctx.shadowBlur = size * 0.35;
  ctx.globalAlpha = 0.92;
  ctx.fillText(stampText(when), w - size * 1.4, h - size * 1.3);
  ctx.restore();
}

export type DevelopOptions = {
  theme: CameraTheme;
  dateStamp: boolean;
  mirror?: boolean;
  when?: Date;
  /** Width / height of the viewfinder. The shot is centre-cropped to match, so what you see is what you get. */
  aspect?: number;
};

/** Turns a video frame or picked image into the final JPEG that gets uploaded. */
export async function develop(src: Source, opts: DevelopOptions): Promise<Blob> {
  const { w: fullW, h: fullH } = sourceSize(src);
  if (!fullW || !fullH) throw new Error("The camera isn't ready yet.");
  // Centre crop to the viewfinder's aspect ratio.
  let sx = 0;
  let sy = 0;
  let sw = fullW;
  let sh = fullH;
  if (opts.aspect && opts.aspect > 0) {
    if (fullW / fullH > opts.aspect) {
      sw = Math.round(fullH * opts.aspect);
      sx = Math.round((fullW - sw) / 2);
    } else {
      sh = Math.round(fullW / opts.aspect);
      sy = Math.round((fullH - sh) / 2);
    }
  }
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { w, h } = fitWithin(sw, sh, side);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    if (opts.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    applyLook(ctx, w, h, opts.theme);
    if (opts.dateStamp) drawStamp(ctx, w, h, opts.when ?? new Date());
    const blob = await canvasToJpeg(canvas, 0.86);
    if (blob.size <= MAX_BYTES) return blob;
    side = Math.round(side * 0.75);
  }
  throw new Error("That photo is too large to send.");
}
