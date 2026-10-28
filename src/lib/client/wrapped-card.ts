"use client";

const W = 1080;
const H = 1920;

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

export type WrappedCardData = {
  title: string;
  photos: number;
  shooters: number;
  busiest: string | null;
  top: string | null;
  pictures: string[];
};

/** Story-size "Event Wrapped" card: three prints and the night's numbers. */
export async function makeWrappedCard(d: WrappedCardData) {
  await document.fonts?.load('800 80px "Archivo Variable"').catch(() => {});
  const imgs = (await Promise.all(d.pictures.slice(0, 3).map(loadImage))).filter((i): i is HTMLImageElement => !!i);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const font = '"Archivo Variable", system-ui, sans-serif';

  g.fillStyle = "#1d1e21";
  g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W * 0.5, H * 0.3, 60, W * 0.5, H * 0.3, H * 0.6);
  glow.addColorStop(0, "rgba(37,70,216,0.35)");
  glow.addColorStop(1, "rgba(29,30,33,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  g.textAlign = "center";
  g.fillStyle = "#ffd23f";
  g.font = `700 30px ${font}`;
  g.fillText("THE NIGHT, WRAPPED", W / 2, 260);
  g.fillStyle = "#f1ecdf";
  let size = 76;
  do {
    g.font = `800 ${size}px ${font}`;
    if (g.measureText(d.title).width < W - 160) break;
    size -= 2;
  } while (size > 30);
  g.fillText(d.title, W / 2, 260 + size + 14);

  // Three prints fanned out.
  const pw = 360;
  const ph = 450;
  const angles = [-8, 3, 10];
  const xs = [W / 2 - 250, W / 2, W / 2 + 250];
  imgs.forEach((img, i) => {
    g.save();
    g.translate(xs[i], 720);
    g.rotate((angles[i] * Math.PI) / 180);
    g.shadowColor = "rgba(0,0,0,0.5)";
    g.shadowBlur = 40;
    g.shadowOffsetY = 18;
    g.fillStyle = "#fbfaf7";
    g.fillRect(-pw / 2 - 18, -ph / 2 - 18, pw + 36, ph + 80);
    g.shadowColor = "transparent";
    cover(g, img, -pw / 2, -ph / 2, pw, ph);
    g.restore();
  });

  // Numbers
  g.fillStyle = "#f1ecdf";
  g.font = `800 190px ${font}`;
  g.fillText(String(d.photos), W / 2, 1230);
  g.fillStyle = "rgba(241,236,223,0.8)";
  g.font = `600 44px ${font}`;
  g.fillText(`photos from ${d.shooters} ${d.shooters === 1 ? "guest" : "guests"}`, W / 2, 1300);

  const lines: [string, string][] = [];
  if (d.busiest) lines.push(["Busiest moment", d.busiest]);
  if (d.top) lines.push(["Most shots", d.top]);
  lines.forEach(([k, v], i) => {
    const y = 1400 + i * 115;
    g.fillStyle = "#ffd23f";
    g.font = `700 28px ${font}`;
    g.fillText(k.toUpperCase(), W / 2, y);
    g.fillStyle = "#f1ecdf";
    g.font = `700 46px ${font}`;
    g.fillText(v, W / 2, y + 54);
  });

  g.fillStyle = "#ffd23f";
  g.font = `800 38px ${font}`;
  g.fillText("lastshot.app", W / 2, H - 230);

  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("Couldn't make the card.");
  return blob;
}
