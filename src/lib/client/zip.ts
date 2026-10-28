"use client";

import { downloadZip } from "client-zip";

export type ZipFile = { name: string; url: string | null };

const BATCH = 100;

function slug(s: string) {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "lastshot";
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * Downloads files as ZIPs in batches of 100 so phones don't run out of memory
 * on big galleries. Calls onProgress with files done / total.
 */
export async function downloadAsZips(title: string, files: ZipFile[], onProgress?: (done: number, total: number) => void) {
  const usable = files.filter((f): f is { name: string; url: string } => !!f.url);
  const parts = Math.ceil(usable.length / BATCH);
  let done = 0;
  for (let p = 0; p < parts; p++) {
    const batch = usable.slice(p * BATCH, (p + 1) * BATCH);
    async function* entries() {
      for (const f of batch) {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error("A photo couldn't be downloaded. Try again.");
        yield { name: f.name, input: res, lastModified: new Date() };
        done++;
        onProgress?.(done, usable.length);
      }
    }
    const blob = await downloadZip(entries()).blob();
    saveBlob(blob, parts > 1 ? `${slug(title)}-part-${p + 1}-of-${parts}.zip` : `${slug(title)}.zip`);
  }
}

export async function downloadSingle(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("The photo couldn't be downloaded.");
  saveBlob(await res.blob(), filename);
}
