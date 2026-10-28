"use client";

import { useState } from "react";
import { makeWrappedCard, type WrappedCardData } from "@/lib/client/wrapped-card";
import { guestButton } from "@/components/guest/guest-shell";

export function WrappedShare({ data }: { data: WrappedCardData }) {
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const blob = await makeWrappedCard(data);
      setCard({ url: URL.createObjectURL(blob), blob });
    } catch {
      setError("Couldn't make the card. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!card) return;
    const file = new File([card.blob], `${data.title.replace(/[^\w]+/g, "-")}-wrapped.jpg`, { type: "image/jpeg" });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${data.title}, wrapped` });
        return;
      }
    } catch {
      /* cancelled: fall back to saving */
    }
    const a = document.createElement("a");
    a.href = card.url;
    a.download = file.name;
    a.click();
  }

  return (
    <>
      <button type="button" onClick={make} disabled={busy} className={guestButton}>
        {busy ? "Making your card" : "Share the night"}
      </button>
      {error && <p className="text-sm text-flash">{error}</p>}
      {card && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4" role="dialog" aria-label="Your Wrapped card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.url} alt="Your Event Wrapped card" className="max-h-[72dvh] max-w-full rounded-[8px] object-contain shadow-2xl" />
          <p className="max-w-xs text-center text-sm text-cream-dim">Tap Save or share, then pick Instagram and choose Story.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={share} className="h-12 rounded-full bg-flash px-6 font-bold text-body">
              Save or share
            </button>
            <button
              onClick={() => {
                URL.revokeObjectURL(card.url);
                setCard(null);
              }}
              className="h-12 rounded-full bg-cream/15 px-6 font-semibold text-cream"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
