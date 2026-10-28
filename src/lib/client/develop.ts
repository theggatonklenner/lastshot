"use client";

import type { CameraTheme } from "@/lib/themes";
import { canvasToJpeg, fitWithin, sourceSize } from "@/lib/client/image";

// 2048px is plenty for a disposable-camera look and keeps uploads around 1 MB.
const MAX_SIDE = 2048;
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
    } else if (theme.filter === "bw") {
      v = (i - 128) * 1.22 + 128; // punchy black and white
    } else if (theme.filter === "warm" || theme.filter === "cool") {
      v = (i - 128) * 1.05 + 132;
    } else if (theme.filter === "faded") {
      v = 40 + i * 0.78; // lifted blacks, matte look
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
      } else if (theme.filter === "bw") {
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        r = g = b = l;
      } else if (theme.filter === "warm") {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * 1.2 + 16;
        g = l + (g - l) * 1.2 + 6;
        b = l + (b - l) * 1.2 - 14;
      } else if (theme.filter === "cool") {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * 1.05 - 10;
        g = l + (g - l) * 1.05 + 2;
        b = l + (b - l) * 1.05 + 16;
      } else if (theme.filter === "faded") {
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        r = l + (r - l) * 0.72 + 4;
        g = l + (g - l) * 0.72 + 2;
        b = l + (b - l) * 0.72 + 6;
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

export type PhotoFrame = { text: string | null; subtext: string | null; color: "white" | "cream" | "black" };

const FRAME_COLORS = {
  white: { bg: "#fbfaf7", ink: "#16171a", sub: "#565962" },
  cream: { bg: "#f1ecdf", ink: "#16171a", sub: "#5c5a52" },
  black: { bg: "#16171a", ink: "#f1ecdf", sub: "#b9b4a7" },
};

/** Shrinks text until it fits the width. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, maxWidth: number) {
  let size = start;
  do {
    ctx.font = `${weight} ${size}px "Archivo Variable", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.92;
  } while (size > 8);
  return size;
}

/** Puts the photo in a printed-style border with the organiser's text underneath. */
export function drawFrame(photo: HTMLCanvasElement, frame: PhotoFrame) {
  const w = photo.width;
  const h = photo.height;
  const unit = Math.min(w, h);
  const border = Math.round(unit * 0.045);
  const band = Math.round(unit * (frame.text && frame.subtext ? 0.2 : 0.15));
  const out = document.createElement("canvas");
  out.width = w + border * 2;
  out.height = h + border + band;
  const ctx = out.getContext("2d")!;
  const c = FRAME_COLORS[frame.color] ?? FRAME_COLORS.white;
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(photo, border, border);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const cx = out.width / 2;
  const top = h + border;
  const maxText = out.width - border * 4;
  if (frame.text && frame.subtext) {
    const s1 = fitFont(ctx, frame.text, 800, band * 0.3, maxText);
    ctx.fillStyle = c.ink;
    ctx.font = `800 ${s1}px "Archivo Variable", system-ui, sans-serif`;
    ctx.fillText(frame.text, cx, top + band * 0.42);
    const s2 = fitFont(ctx, frame.subtext, 600, band * 0.19, maxText);
    ctx.fillStyle = c.sub;
    ctx.font = `600 ${s2}px "Archivo Variable", system-ui, sans-serif`;
    ctx.fillText(frame.subtext, cx, top + band * 0.72);
  } else {
    const t = frame.text || frame.subtext || "";
    const s = fitFont(ctx, t, 800, band * 0.36, maxText);
    ctx.fillStyle = c.ink;
    ctx.font = `800 ${s}px "Archivo Variable", system-ui, sans-serif`;
    ctx.fillText(t, cx, top + band * 0.5);
  }
  return out;
}

export type DevelopOptions = {
  theme: CameraTheme;
  /** The guest's final shot: gold border and a "Last shot" stamp. */
  lastShot?: boolean;
  /** Custom photo frame add-on. */
  frame?: PhotoFrame | null;
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
    let finalCanvas = canvas;
    if (opts.frame && (opts.frame.text || opts.frame.subtext)) {
      try {
        await document.fonts?.load('800 40px "Archivo Variable"');
      } catch {
        /* fall back to the system font */
      }
      finalCanvas = drawFrame(canvas, opts.frame);
    }
    if (opts.lastShot) finalCanvas = drawLastShot(finalCanvas);
    const blob = await canvasToJpeg(finalCanvas, 0.84);
    if (blob.size <= MAX_BYTES) return blob;
    side = Math.round(side * 0.75);
  }
  throw new Error("That photo is too large to send.");
}

/**
 * Same look as develop(), drawn straight to a canvas at a small size, for a
 * live preview (no JPEG encoding). Fonts for the frame should already be loaded.
 */
export function renderLook(
  src: Source,
  opts: DevelopOptions & { original?: boolean },
  maxSide: number,
  into?: HTMLCanvasElement,
): HTMLCanvasElement | null {
  const { w: fullW, h: fullH } = sourceSize(src);
  if (!fullW || !fullH) return null;
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
  const { w, h } = fitWithin(sw, sh, maxSide);
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
  if (!opts.original) {
    applyLook(ctx, w, h, opts.theme);
    if (opts.dateStamp) drawStamp(ctx, w, h, opts.when ?? new Date());
  }
  const out = opts.frame && (opts.frame.text || opts.frame.subtext) ? drawFrame(canvas, opts.frame) : canvas;
  if (!into) return out;
  if (into.width !== out.width || into.height !== out.height) {
    into.width = out.width;
    into.height = out.height;
  }
  into.getContext("2d")!.drawImage(out, 0, 0);
  return into;
}

/** Gold border and a "LAST SHOT" stamp around the guest's final photo. */
export function drawLastShot(photo: HTMLCanvasElement) {
  const unit = Math.min(photo.width, photo.height);
  const b = Math.round(unit * 0.032);
  const out = document.createElement("canvas");
  out.width = photo.width + b * 2;
  out.height = photo.height + b * 2;
  const g = out.getContext("2d")!;
  const gold = g.createLinearGradient(0, 0, out.width, out.height);
  gold.addColorStop(0, "#b8892b");
  gold.addColorStop(0.35, "#f6dc8a");
  gold.addColorStop(0.6, "#d4a537");
  gold.addColorStop(1, "#8f6a1f");
  g.fillStyle = gold;
  g.fillRect(0, 0, out.width, out.height);
  g.drawImage(photo, b, b);
  // Thin dark line between the gold and the photo, like a mount.
  g.strokeStyle = "rgba(22,23,26,0.55)";
  g.lineWidth = Math.max(1, Math.round(unit * 0.003));
  g.strokeRect(b, b, photo.width, photo.height);

  // Stamp in the top-left corner of the photo.
  const size = Math.round(unit * 0.045);
  g.font = `800 ${size}px "Archivo Variable", system-ui, sans-serif`;
  const text = "LAST SHOT";
  const pad = Math.round(size * 0.45);
  const w = g.measureText(text).width + pad * 2;
  const h = size + pad * 1.2;
  const x = b + Math.round(unit * 0.04);
  const y = b + Math.round(unit * 0.04);
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate((-4 * Math.PI) / 180);
  g.fillStyle = gold;
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = size * 0.4;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, size * 0.25);
  g.fill();
  g.shadowColor = "transparent";
  g.fillStyle = "#16171a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 0, size * 0.04);
  g.restore();
  return out;
}
