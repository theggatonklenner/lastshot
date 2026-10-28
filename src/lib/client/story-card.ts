"use client";

const W = 1080;
const H = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The photo didn't load."));
    img.src = url;
  });
}

/** Shrinks text until it fits the width. */
function fit(g: CanvasRenderingContext2D, text: string, weight: number, size: number, max: number, family: string) {
  let s = size;
  do {
    g.font = `${weight} ${s}px ${family}`;
    if (g.measureText(text).width <= max) break;
    s -= 2;
  } while (s > 20);
  return s;
}

/**
 * A 1080 x 1920 Instagram Story image: the photo as a tilted print on a dark
 * film background, the event name above it and a small lastshot.app credit
 * below. Leaves the top and bottom clear of Instagram's own buttons.
 */
export async function makeStoryCard(url: string, opts: { title: string; dateLine?: string; brand?: string | null }) {
  const img = await loadImage(url);
  await document.fonts?.load('800 80px "Archivo Variable"').catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const display = '"Archivo Variable", system-ui, sans-serif';

  // Background: deep charcoal with a warm glow and light grain.
  g.fillStyle = "#1d1e21";
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, H * 0.48, 80, W / 2, H * 0.48, H * 0.7);
  glow.addColorStop(0, "rgba(255,138,43,0.22)");
  glow.addColorStop(1, "rgba(29,30,33,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);
  const grain = g.getImageData(0, 0, W, H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    grain.data[i] += n;
    grain.data[i + 1] += n;
    grain.data[i + 2] += n;
  }
  g.putImageData(grain, 0, 0);

  // Title
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = "#ffd23f";
  g.font = `700 30px ${display}`;
  g.fillText((opts.dateLine || "THE ROLL").toUpperCase(), W / 2, 300);
  g.fillStyle = "#f1ecdf";
  const size = fit(g, opts.title, 800, 84, W - 160, display);
  g.font = `800 ${size}px ${display}`;
  g.fillText(opts.title, W / 2, 300 + size + 18);

  // The print: photo inside a white border with a thicker bottom, tilted slightly.
  const maxW = 820;
  const maxH = 860;
  const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight);
  const pw = Math.round(img.naturalWidth * k);
  const ph = Math.round(img.naturalHeight * k);
  const border = 30;
  const bottom = 120;
  const cardW = pw + border * 2;
  const cardH = ph + border + bottom;
  const cy = 470 + (maxH + border + bottom) / 2;
  g.save();
  g.translate(W / 2, cy);
  g.rotate((-2.2 * Math.PI) / 180);
  g.shadowColor = "rgba(0,0,0,0.55)";
  g.shadowBlur = 60;
  g.shadowOffsetY = 24;
  g.fillStyle = "#fbfaf7";
  g.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
  g.shadowColor = "transparent";
  g.drawImage(img, -pw / 2, -cardH / 2 + border, pw, ph);
  g.fillStyle = "#16171a";
  g.font = `700 34px ${display}`;
  g.textAlign = "left";
  const label = opts.brand || opts.dateLine || "";
  g.fillText(label, -cardW / 2 + border + 6, cardH / 2 - bottom / 2 + 12);
  g.restore();

  // Credit, kept above Instagram's reply bar.
  g.textAlign = "center";
  g.fillStyle = "rgba(241,236,223,0.75)";
  g.font = `600 30px ${display}`;
  g.fillText("Shot on a Lastshot disposable camera", W / 2, H - 330);
  g.fillStyle = "#ffd23f";
  g.font = `800 38px ${display}`;
  g.fillText("lastshot.app", W / 2, H - 278);

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't make the story image.");
  return blob;
}
