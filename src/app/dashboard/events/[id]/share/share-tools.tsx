"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "qrcode";
import { SIGN_DESIGNS, buildSign, type SignDesign } from "@/lib/client/signs";
import { saveBlob } from "@/lib/client/zip";
import { Button, LinkButton, Panel, cx } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

function slug(s: string) {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "event";
}

export function ShareTools({
  url,
  title,
  dateLine,
  shots,
  eventId,
  logoUrl,
}: {
  url: string;
  title: string;
  dateLine: string;
  shots: number;
  eventId: string;
  logoUrl?: string | null;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const canShare = useSyncExternalStore(
    () => () => {},
    () => "share" in navigator,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [design, setDesign] = useState<SignDesign>("poster");

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
      const logoPng = logoUrl
        ? await fetch(logoUrl)
            .then((r) => (r.ok ? r.arrayBuffer() : null))
            .then((b) => (b ? new Uint8Array(b) : null))
            .catch(() => null)
        : null;
      const bytes = await buildSign(design, { title, dateLine, shots, url, qrPng: qr, logoPng });
      saveBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${slug(title)}-${design}.pdf`);
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
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold">Printable sign</legend>
          <div className="grid grid-cols-2 gap-2">
            {SIGN_DESIGNS.map((d) => (
              <label
                key={d.id}
                className={cx(
                  "flex cursor-pointer gap-3 rounded-control border bg-card p-2.5 transition-colors",
                  design === d.id ? "border-cobalt ring-2 ring-cobalt/20" : "border-line hover:border-ink/30",
                )}
              >
                <input type="radio" name="sign" className="sr-only" checked={design === d.id} onChange={() => setDesign(d.id)} />
                <SignThumb design={d.id} />
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-sm leading-snug text-graphite">{d.description}</span>
                </span>
              </label>
            ))}
          </div>
          <Button onClick={downloadPdf} pending={busy} disabled={!qr} className="mt-1 self-start">
            Download {SIGN_DESIGNS.find((d) => d.id === design)!.name.toLowerCase()} (PDF)
          </Button>
        </fieldset>
        <div className="flex flex-wrap justify-center gap-2 border-t border-line pt-4">
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

/** Tiny schematic of each sign so organisers can tell them apart. */
function SignThumb({ design }: { design: SignDesign }) {
  const qr = <span className="block size-5 rounded-[2px] bg-[repeating-conic-gradient(#16171a_0_25%,#fff_0_50%)] bg-[length:6px_6px]" />;
  if (design === "cards") {
    return (
      <span className="grid h-14 w-10 shrink-0 grid-cols-2 gap-px rounded-[3px] border border-line bg-line">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="flex flex-col items-center justify-center gap-0.5 bg-white">
            <span className="h-1 w-3 bg-cobalt" />
            <span className="block size-2.5 bg-[repeating-conic-gradient(#16171a_0_25%,#fff_0_50%)] bg-[length:3px_3px]" />
          </span>
        ))}
      </span>
    );
  }
  if (design === "tent") {
    return (
      <span className="flex h-14 w-10 shrink-0 flex-col rounded-[3px] border border-line bg-white">
        <span className="flex flex-1 rotate-180 flex-col items-center justify-center gap-0.5">
          <span className="h-1 w-6 bg-cobalt" />
          <span className="block size-3 bg-[repeating-conic-gradient(#16171a_0_25%,#fff_0_50%)] bg-[length:4px_4px]" />
        </span>
        <span className="border-t border-dashed border-graphite/50" />
        <span className="flex flex-1 flex-col items-center justify-center gap-0.5">
          <span className="h-1 w-6 bg-cobalt" />
          <span className="block size-3 bg-[repeating-conic-gradient(#16171a_0_25%,#fff_0_50%)] bg-[length:4px_4px]" />
        </span>
      </span>
    );
  }
  const night = design === "night";
  return (
    <span className={cx("flex h-14 w-10 shrink-0 flex-col items-center gap-1 overflow-hidden rounded-[3px] border border-line", night ? "bg-body" : "bg-white")}>
      <span className={cx("h-3 w-full", night ? "bg-body" : "bg-cobalt")} />
      <span className={cx("h-1 w-6", night ? "bg-flash" : "bg-ink")} />
      <span className="rounded-[2px] bg-white p-0.5">{qr}</span>
    </span>
  );
}
