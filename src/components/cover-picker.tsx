"use client";

import { useRef, useState } from "react";
import { decodeFile, shrinkToJpeg } from "@/lib/client/image";
import { Button, Notice } from "@/components/ui";
import { CoverCropper } from "@/components/cover-cropper";

type Editing = { src: ImageBitmap | HTMLImageElement; original: Blob | null };

export function CoverPicker({
  eventId,
  initialUrl,
  initialOriginalUrl = null,
  accent,
}: {
  eventId: string;
  initialUrl: string | null;
  /** The full photo the current cover was cropped from, if it was kept. */
  initialOriginalUrl?: string | null;
  accent: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [originalUrl, setOriginalUrl] = useState(initialOriginalUrl);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      // Shrink first so huge phone photos stay quick to move around and upload.
      const original = await shrinkToJpeg(file, 2400, 2.5 * 1024 * 1024);
      setEditing({ src: await decodeFile(original), original });
    } catch {
      setError("That file isn't an image we can use.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function adjust() {
    const from = originalUrl ?? url;
    if (!from) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await (await fetch(from)).blob();
      // Re-cropping keeps the same original, so nothing new needs uploading for it.
      setEditing({ src: await decodeFile(blob), original: originalUrl ? null : blob });
    } catch {
      setError("Couldn't load the cover to adjust it. Choose the photo again instead.");
    } finally {
      setBusy(false);
    }
  }

  async function save(cover: Blob) {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("cover", cover, "cover.jpg");
      const original = editing.original ?? (originalUrl ? await (await fetch(originalUrl)).blob() : null);
      if (original) form.append("original", original, "original.jpg");
      const res = await fetch(`/api/events/${eventId}/cover`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "The cover didn't upload.");
      setUrl(json.url);
      setOriginalUrl(json.originalUrl ?? null);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The cover didn't upload.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/events/${eventId}/cover`, { method: "DELETE" });
    setUrl(null);
    setOriginalUrl(null);
    setBusy(false);
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      className="sr-only"
      id={`cover-${eventId}`}
      onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])}
    />
  );

  if (editing) {
    return (
      <div className="flex flex-col gap-4">
        <CoverCropper src={editing.src} busy={busy} onCancel={() => setEditing(null)} onSave={save} />
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/2] w-full max-w-lg overflow-hidden rounded-panel border border-line bg-body">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Event cover" className="size-full object-cover" />
        ) : (
          <div className="grain flex size-full items-center justify-center" style={{ background: accent }}>
            <span className="text-white/85">No cover yet. Your event colour is used instead.</span>
          </div>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex flex-wrap gap-2">
        {fileInput}
        <Button type="button" variant="secondary" pending={busy} onClick={() => input.current?.click()}>
          {url ? "Change cover" : "Choose a cover image"}
        </Button>
        {url && (
          <Button type="button" variant="secondary" onClick={adjust} disabled={busy}>
            Move and crop
          </Button>
        )}
        {url && (
          <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
