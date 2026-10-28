"use client";

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";

export type SignDesign = "poster" | "night" | "tent" | "cards";

export const SIGN_DESIGNS: { id: SignDesign; name: string; description: string }[] = [
  { id: "poster", name: "Poster", description: "A4 sign with a bold header. Good for entrances and walls." },
  { id: "night", name: "Night poster", description: "Dark A4 sign that stands out in dim venues." },
  { id: "tent", name: "Table tent", description: "Fold an A4 sheet in half so it stands on each table." },
  { id: "cards", name: "Small cards", description: "Four cards per A4 page to cut out and scatter around." },
];

export type SignInput = {
  title: string;
  dateLine: string;
  shots: number;
  url: string;
  qrPng: string;
  /** Your branding add-on: PNG bytes of the organiser's logo, shown instead of "lastshot". */
  logoPng?: Uint8Array | null;
};

type Brand = { logo: PDFImage | null };

/** Draws the organiser's logo (fitted into a box, right-aligned) or the Lastshot wordmark. */
function drawBrandMark(page: PDFPage, f: Fonts, brand: Brand, rightX: number, y: number, color: RGB) {
  if (brand.logo) {
    const maxW = 120;
    const maxH = 30;
    const scale = Math.min(maxW / brand.logo.width, maxH / brand.logo.height);
    const w = brand.logo.width * scale;
    const h = brand.logo.height * scale;
    page.drawImage(brand.logo, { x: rightX - w, y: y - 6, width: w, height: h });
    return;
  }
  page.drawText("lastshot", { x: rightX - f.bold.widthOfTextAtSize("lastshot", 14), y, size: 14, font: f.bold, color });
}

const A4: [number, number] = [595.28, 841.89];
const INK = rgb(0.086, 0.09, 0.102);
const COBALT = rgb(0.145, 0.275, 0.847);
const BODY = rgb(0.114, 0.118, 0.129);
const CREAM = rgb(0.945, 0.925, 0.875);
const FLASH = rgb(1, 0.824, 0.247);
const GREY = rgb(0.34, 0.35, 0.38);
const WHITE = rgb(1, 1, 1);

/** Standard PDF fonts only cover Latin-1, so drop anything else (emoji etc). */
export function pdfSafe(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/** Wraps text to a width in points using the real font metrics. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrinks a title until it fits in at most `maxLines` lines. */
function fitTitle(text: string, font: PDFFont, start: number, min: number, maxWidth: number, maxLines: number) {
  for (let size = start; size >= min; size -= 2) {
    const lines = wrap(text, font, size, maxWidth);
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: min, lines: wrap(text, font, min, maxWidth).slice(0, maxLines) };
}

type Fonts = { bold: PDFFont; regular: PDFFont };

/** Draw helpers that can mirror a layout onto the upper half, upside down (for table tents). */
function painter(page: PDFPage, flip: boolean) {
  const { width: W, height: H } = page.getSize();
  const pt = (x: number, y: number) => (flip ? { x: W - x, y: H - y } : { x, y });
  const rotate = flip ? degrees(180) : undefined;
  return {
    text(t: string, x: number, y: number, size: number, font: PDFFont, color: RGB) {
      page.drawText(t, { ...pt(x, y), size, font, color, rotate });
    },
    centered(t: string, cx: number, y: number, size: number, font: PDFFont, color: RGB) {
      const w = font.widthOfTextAtSize(t, size);
      this.text(t, cx - w / 2, y, size, font, color);
    },
    image(img: PDFImage, x: number, y: number, w: number, h: number) {
      page.drawImage(img, { ...pt(x, y), width: w, height: h, rotate });
    },
    rect(x: number, y: number, w: number, h: number, color: RGB) {
      page.drawRectangle({ ...pt(x, y), width: w, height: h, color, rotate });
    },
  };
}

function footerUrl(url: string) {
  return url.replace(/^https?:\/\//, "");
}

function drawPoster(page: PDFPage, f: Fonts, qr: PDFImage, s: SignInput, brand: Brand) {
  const { width: W, height: H } = page.getSize();
  const p = painter(page, false);
  p.rect(0, H - 150, W, 150, COBALT);
  p.text("Take a photo for us", 48, H - 92, 36, f.bold, WHITE);
  p.text(`Scan the code to grab a camera. You get ${s.shots} shots.`, 48, H - 124, 15, f.regular, WHITE);

  const t = fitTitle(pdfSafe(s.title), f.bold, 30, 18, W - 96, 2);
  let y = H - 205;
  for (const line of t.lines) {
    p.text(line, 48, y, t.size, f.bold, INK);
    y -= t.size + 6;
  }
  if (s.dateLine) p.text(pdfSafe(s.dateLine), 48, y, 13, f.regular, INK);

  const size = 330;
  p.image(qr, (W - size) / 2, 190, size, size);
  const steps = ["Open your phone camera and point it at the code", "Tap the link, then tap Start camera", "Make every shot count"];
  steps.forEach((line, i) => p.text(`${i + 1}.  ${line}`, 70, 150 - i * 24, 13, i === 2 ? f.bold : f.regular, INK));
  p.text(footerUrl(s.url), 48, 48, 10, f.regular, GREY);
  drawBrandMark(page, f, brand, W - 48, 46, COBALT);
}

function drawNight(page: PDFPage, f: Fonts, qr: PDFImage, s: SignInput, brand: Brand) {
  const { width: W, height: H } = page.getSize();
  const p = painter(page, false);
  p.rect(0, 0, W, H, BODY);
  // Shot counter window
  const counter = String(s.shots).padStart(2, "0");
  p.rect(48, H - 130, 92, 70, rgb(0, 0, 0));
  p.text(counter, 48 + (92 - f.bold.widthOfTextAtSize(counter, 44)) / 2, H - 112, 44, f.bold, CREAM);
  p.text("shots each", 152, H - 104, 16, f.regular, CREAM);

  p.text("Scan for a camera", 48, H - 200, 40, f.bold, CREAM);
  const t = fitTitle(pdfSafe(s.title), f.bold, 22, 14, W - 96, 2);
  let y = H - 240;
  for (const line of t.lines) {
    p.text(line, 48, y, t.size, f.bold, FLASH);
    y -= t.size + 6;
  }
  if (s.dateLine) p.text(pdfSafe(s.dateLine), 48, y, 12, f.regular, CREAM);

  const size = 320;
  const box = size + 36;
  p.rect((W - box) / 2, 150, box, box, WHITE);
  p.image(qr, (W - size) / 2, 168, size, size);
  p.centered("No app needed. Your photos go to one shared roll.", W / 2, 112, 14, f.regular, CREAM);
  p.text(footerUrl(s.url), 48, 48, 10, f.regular, rgb(0.72, 0.7, 0.65));
  drawBrandMark(page, f, brand, W - 48, 46, FLASH);
}

/** One half of a table tent, laid out in the bottom half of the page. */
function drawTentHalf(page: PDFPage, f: Fonts, qr: PDFImage, s: SignInput, flip: boolean) {
  const { width: W, height: H } = page.getSize();
  const half = H / 2;
  const p = painter(page, flip);
  p.rect(0, half - 64, W, 64, COBALT);
  p.centered("Take a photo for us", W / 2, half - 42, 24, f.bold, WHITE);
  const size = 210;
  p.image(qr, (W - size) / 2, half - 64 - 24 - size, size, size);
  const t = fitTitle(pdfSafe(s.title), f.bold, 18, 12, W - 80, 1);
  p.centered(t.lines[0] ?? "", W / 2, 92, t.size, f.bold, INK);
  p.centered(`Scan with your phone camera. ${s.shots} shots each, no app.`, W / 2, 66, 12, f.regular, INK);
  p.centered(footerUrl(s.url), W / 2, 40, 9, f.regular, GREY);
}

function drawTent(page: PDFPage, f: Fonts, qr: PDFImage, s: SignInput) {
  const { width: W, height: H } = page.getSize();
  drawTentHalf(page, f, qr, s, false);
  drawTentHalf(page, f, qr, s, true);
  // Fold line
  for (let x = 20; x < W - 20; x += 14) {
    page.drawLine({ start: { x, y: H / 2 }, end: { x: x + 7, y: H / 2 }, thickness: 0.6, color: GREY });
  }
  page.drawText("fold", { x: W - 40, y: H / 2 + 4, size: 7, font: f.regular, color: GREY });
}

function drawCards(page: PDFPage, f: Fonts, qr: PDFImage, s: SignInput) {
  const { width: W, height: H } = page.getSize();
  const cw = W / 2;
  const ch = H / 2;
  const t = fitTitle(pdfSafe(s.title), f.bold, 16, 10, cw - 56, 2);
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 2; row++) {
      const x0 = col * cw;
      const y0 = row * ch;
      const cx = x0 + cw / 2;
      page.drawRectangle({ x: x0 + 18, y: y0 + ch - 58, width: cw - 36, height: 40, color: COBALT });
      const head = "Grab a camera";
      page.drawText(head, { x: cx - f.bold.widthOfTextAtSize(head, 18) / 2, y: y0 + ch - 44, size: 18, font: f.bold, color: WHITE });
      const size = 200;
      page.drawImage(qr, { x: cx - size / 2, y: y0 + ch - 72 - size, width: size, height: size });
      let y = y0 + ch - 72 - size - 26;
      for (const line of t.lines) {
        page.drawText(line, { x: cx - f.bold.widthOfTextAtSize(line, t.size) / 2, y, size: t.size, font: f.bold, color: INK });
        y -= t.size + 4;
      }
      const sub = `${s.shots} shots each. No app needed.`;
      page.drawText(sub, { x: cx - f.regular.widthOfTextAtSize(sub, 11) / 2, y: y - 4, size: 11, font: f.regular, color: INK });
    }
  }
  // Cut lines
  const dash = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += 12) {
      const a = d / len;
      const b = Math.min(1, (d + 6) / len);
      page.drawLine({
        start: { x: x1 + (x2 - x1) * a, y: y1 + (y2 - y1) * a },
        end: { x: x1 + (x2 - x1) * b, y: y1 + (y2 - y1) * b },
        thickness: 0.5,
        color: GREY,
      });
    }
  };
  dash(W / 2, 0, W / 2, H);
  dash(0, H / 2, W, H / 2);
}

/** Builds the chosen sign as a PDF. */
export async function buildSign(design: SignDesign, s: SignInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${pdfSafe(s.title)} camera sign`);
  pdf.setCreator(s.logoPng ? "" : "Lastshot");
  const fonts = { bold: await pdf.embedFont(StandardFonts.HelveticaBold), regular: await pdf.embedFont(StandardFonts.Helvetica) };
  const qr = await pdf.embedPng(s.qrPng);
  const brand: Brand = { logo: s.logoPng ? await pdf.embedPng(s.logoPng).catch(() => null) : null };
  const page = pdf.addPage(A4);
  if (design === "poster") drawPoster(page, fonts, qr, s, brand);
  if (design === "night") drawNight(page, fonts, qr, s, brand);
  if (design === "tent") drawTent(page, fonts, qr, s);
  if (design === "cards") drawCards(page, fonts, qr, s);
  return pdf.save();
}
