"use client";

export type CollageLayout = "grid" | "strip";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("A photo didn't load."));
    img.src = url;
  });
}

/** Draws an image into a box, cropping from the centre to fill it. */
function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function gridShape(n: number) {
  if (n <= 2) return { cols: n, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 2, rows: 3 };
  return { cols: 3, rows: 3 };
}

/**
 * Builds a collage from 2 to 9 photos: a grid (good for posts) or a film
 * strip (good for stories). Runs entirely in the browser.
 */
export async function makeCollage(urls: string[], layout: CollageLayout, title: string): Promise<Blob> {
  const imgs = await Promise.all(urls.slice(0, 9).map(loadImage));
  await document.fonts?.load('800 40px "Archivo Variable"').catch(() => {});
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = '"Archivo Variable", system-ui, sans-serif';

  if (layout === "grid") {
    const { cols, rows } = gridShape(imgs.length);
    const W = 1080;
    const pad = 36;
    const gap = 14;
    const cell = (W - pad * 2 - gap * (cols - 1)) / cols;
    const footer = 120;
    c.width = W;
    c.height = Math.round(pad + rows * cell + (rows - 1) * gap + footer);
    g.fillStyle = "#f1ecdf";
    g.fillRect(0, 0, c.width, c.height);
    imgs.forEach((img, i) => {
      const x = pad + (i % cols) * (cell + gap);
      const y = pad + Math.floor(i / cols) * (cell + gap);
      cover(g, img, x, y, cell, cell);
    });
    g.fillStyle = "#16171a";
    g.font = `800 46px ${font}`;
    g.textBaseline = "middle";
    g.fillText(title.slice(0, 32), pad, c.height - footer / 2);
    g.fillStyle = "#565962";
    g.font = `600 26px ${font}`;
    g.textAlign = "right";
    g.fillText("lastshot.app", W - pad, c.height - footer / 2);
  } else {
    const W = 1080;
    const holeBand = 90;
    const frameW = W - holeBand * 2;
    const frameH = Math.round(frameW * 0.72);
    const gap = 40;
    const top = 70;
    const footer = 150;
    c.width = W;
    c.height = top + imgs.length * frameH + (imgs.length - 1) * gap + footer;
    g.fillStyle = "#131315";
    g.fillRect(0, 0, c.width, c.height);
    // Sprocket holes down both edges
    g.fillStyle = "#f1ecdf";
    for (let y = 24; y < c.height - 24; y += 64) {
      for (const x of [28, W - 28 - 34]) {
        g.beginPath();
        g.roundRect(x, y, 34, 40, 6);
        g.fill();
      }
    }
    imgs.forEach((img, i) => {
      const y = top + i * (frameH + gap);
      cover(g, img, holeBand, y, frameW, frameH);
      g.fillStyle = "#ff8a2b";
      g.font = `700 22px ${font}`;
      g.fillText(`${String(i + 1).padStart(2, "0")}A`, holeBand, y + frameH + 28);
    });
    g.fillStyle = "#f1ecdf";
    g.font = `800 48px ${font}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(title.slice(0, 30), W / 2, c.height - footer / 2 - 14);
    g.fillStyle = "#b9b4a7";
    g.font = `600 24px ${font}`;
    g.fillText("lastshot.app", W / 2, c.height - footer / 2 + 30);
  }
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The collage didn't save."))), "image/jpeg", 0.9));
}
