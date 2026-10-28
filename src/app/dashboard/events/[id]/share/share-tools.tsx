"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { saveBlob } from "@/lib/client/zip";
import { Button, LinkButton, Panel } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

function slug(s: string) {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "event";
}

/** Standard PDF fonts only cover Latin-1, so drop anything else (emoji etc). */
function pdfSafe(s: string) {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/** Splits text into lines that fit a width, for the PDF sign. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > maxChars) {
      if (line) lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export function ShareTools({
  url,
  title,
  dateLine,
  shots,
  eventId,
}: {
  url: string;
  title: string;
  dateLine: string;
  shots: number;
  eventId: string;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 1200, margin: 2, errorCorrectionLevel: "M", color: { dark: "#16171a", light: "#ffffff" } }).then(setQr);
  }, [url]);

  async function downloadPng() {
    if (!qr) return;
    const blob = await (await fetch(qr)).blob();
    saveBlob(blob, `${slug(title)}-qr.png`);
  }

  async function downloadPdf() {
    if (!qr) return;
    setBusy(true);
    try {
      const pdf = await PDFDocument.create();
      pdf.setTitle(`${pdfSafe(title)} camera sign`);
      const page = pdf.addPage([595.28, 841.89]); // A4
      const { width, height } = page.getSize();
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const ink = rgb(0.086, 0.09, 0.102);
      const cobalt = rgb(0.145, 0.275, 0.847);

      page.drawRectangle({ x: 0, y: height - 150, width, height: 150, color: cobalt });
      page.drawText("Take a photo for us", { x: 48, y: height - 92, size: 36, font: bold, color: rgb(1, 1, 1) });
      page.drawText(`Scan the code to grab a camera. You get ${shots} shots.`, {
        x: 48,
        y: height - 124,
        size: 15,
        font: regular,
        color: rgb(1, 1, 1),
      });

      let y = height - 210;
      for (const line of wrap(pdfSafe(title), 30).slice(0, 2)) {
        page.drawText(line, { x: 48, y, size: 28, font: bold, color: ink });
        y -= 34;
      }
      if (dateLine) {
        page.drawText(pdfSafe(dateLine), { x: 48, y: y + 4, size: 13, font: regular, color: ink });
      }

      const png = await pdf.embedPng(qr);
      const size = 330;
      page.drawImage(png, { x: (width - size) / 2, y: 190, width: size, height: size });

      const steps = ["Open your phone camera and point it at the code", "Tap the link, then tap Start camera", "Make every shot count"];
      steps.forEach((s, i) => {
        page.drawText(`${i + 1}.  ${s}`, { x: 70, y: 150 - i * 24, size: 13, font: i === 2 ? bold : regular, color: ink });
      });
      page.drawText(url, { x: 48, y: 48, size: 10, font: regular, color: rgb(0.34, 0.35, 0.38) });
      page.drawText("lastshot", { x: width - 48 - bold.widthOfTextAtSize("lastshot", 14), y: 46, size: 14, font: bold, color: cobalt });

      const bytes = await pdf.save();
      saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${slug(title)}-sign.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="flex flex-col gap-5">
        <div className="mx-auto w-full max-w-[320px] rounded-panel border border-line bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code that opens ${url}`} className="w-full" />
          ) : (
            <div className="aspect-square animate-pulse rounded-lg bg-paper-2" />
          )}
        </div>
        <p className="text-center text-[15px] break-all text-graphite">{url}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={downloadPdf} pending={busy} disabled={!qr}>
            Download printable sign
          </Button>
          <Button size="sm" variant="secondary" onClick={downloadPng} disabled={!qr}>
            Download QR image
          </Button>
          <CopyButton text={url} label="Copy link" />
          {canShare && (
            <Button size="sm" variant="secondary" onClick={() => navigator.share({ title, text: `Grab a camera for ${title}`, url }).catch(() => {})}>
              Share
            </Button>
          )}
          <LinkButton href={`/dashboard/events/${eventId}/preview`} size="sm" variant="ghost">
            Preview guest page
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
