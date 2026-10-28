"use client";

/** Decodes any browser-readable image (including iPhone HEIC from the photo picker) to a bitmap. */
export async function decodeFile(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // fall through to <img>, which handles more formats on Safari
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function sourceSize(src: ImageBitmap | HTMLImageElement | HTMLVideoElement) {
  if (src instanceof HTMLVideoElement) return { w: src.videoWidth, h: src.videoHeight };
  if (src instanceof HTMLImageElement) return { w: src.naturalWidth, h: src.naturalHeight };
  return { w: src.width, h: src.height };
}

export function fitWithin(w: number, h: number, max: number) {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );
}

/** Re-encodes an image to a JPEG no larger than maxSide and roughly under maxBytes. */
export async function shrinkToJpeg(file: Blob, maxSide = 2400, maxBytes = 3.5 * 1024 * 1024): Promise<Blob> {
  const src = await decodeFile(file);
  const { w, h } = sourceSize(src);
  let side = maxSide;
  for (let attempt = 0; attempt < 4; attempt++) {
    const size = fitWithin(w, h, side);
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext("2d")!.drawImage(src, 0, 0, size.w, size.h);
    const blob = await canvasToJpeg(canvas, 0.85);
    if (blob.size <= maxBytes) return blob;
    side = Math.round(side * 0.75);
  }
  throw new Error("That image is too large to upload.");
}
