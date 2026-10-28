"use client";

import { useRef, useState } from "react";
import { shrinkToJpeg } from "@/lib/client/image";
import { Button, Notice } from "@/components/ui";

export function CoverPicker({ eventId, initialUrl, accent }: { eventId: string; initialUrl: string | null; accent: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const jpeg = await shrinkToJpeg(file, 2000);
      const form = new FormData();
      form.append("cover", jpeg, "cover.jpg");
      const res = await fetch(`/api/events/${eventId}/cover`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "The cover didn't upload.");
      setUrl(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The cover didn't upload.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/events/${eventId}/cover`, { method: "DELETE" });
    setUrl(null);
    setBusy(false);
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
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          id={`cover-${eventId}`}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <Button type="button" variant="secondary" pending={busy} onClick={() => input.current?.click()}>
          {url ? "Change cover" : "Choose a cover image"}
        </Button>
        {url && (
          <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}
