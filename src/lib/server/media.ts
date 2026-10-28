import "server-only";
import sharp, { type Metadata } from "sharp";
import { admin, MEDIA_BUCKET } from "@/lib/supabase/admin";
import { WATERMARK_PNG } from "@/lib/server/watermark-image";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // keeps us under serverless body limits
const MIN_SIDE = 200;
const MAX_SIDE = 8000;
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp"]);

export class InvalidImageError extends Error {}

export type ProcessedImage = {
  original: Buffer;
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  /** Watermarked copies, made for events on the free plan. */
  originalWm?: Buffer;
  displayWm?: Buffer;
};

/** Stamps the badge in the bottom-left corner (the date stamp sits bottom-right). */
async function watermark(jpeg: Buffer, width: number, height: number, quality: number) {
  const badgeWidth = Math.round(Math.max(160, Math.min(width, height) * 0.34));
  const badge = await sharp(WATERMARK_PNG).resize({ width: badgeWidth }).png().toBuffer();
  const margin = Math.round(Math.min(width, height) * 0.035);
  const badgeHeight = Math.round((badgeWidth * 348) / 1142);
  return sharp(jpeg)
    .composite([{ input: badge, left: margin, top: Math.max(0, height - badgeHeight - margin) }])
    .jpeg({ quality, progressive: true })
    .toBuffer();
}

/**
 * Validates the bytes are a real image of a sane size, then re-encodes it.
 * Re-encoding strips metadata (including GPS location) and neutralises
 * anything smuggled inside the file.
 */
export async function processImage(input: Buffer, opts: { watermark?: boolean } = {}): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 50_000_000, failOn: "error" }).metadata();
  } catch {
    throw new InvalidImageError("not_an_image");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw new InvalidImageError("unsupported_format");
  if (!meta.width || !meta.height) throw new InvalidImageError("not_an_image");
  if (Math.min(meta.width, meta.height) < MIN_SIDE || Math.max(meta.width, meta.height) > MAX_SIDE) {
    throw new InvalidImageError("bad_dimensions");
  }

  // Decode once, then encode the three sizes in parallel.
  const base = sharp(input, { limitInputPixels: 50_000_000 }).rotate();
  const [{ data: original, info }, { data: display, info: dInfo }, thumb] = await Promise.all([
    base
      .clone()
      .resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer({ resolveWithObject: true }),
    base
      .clone()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer(),
  ]);

  if (!opts.watermark) return { original, display, thumb, width: info.width, height: info.height };
  const [originalWm, displayWm] = await Promise.all([
    watermark(original, info.width, info.height, 88),
    watermark(display, dInfo.width, dInfo.height, 82),
  ]);
  return { original, display, thumb, width: info.width, height: info.height, originalWm, displayWm };
}

/** Validates a logo and re-encodes it as a PNG (keeps transparency, strips metadata). */
export async function processLogo(input: Buffer): Promise<Buffer> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: 25_000_000, failOn: "error" }).metadata();
  } catch {
    throw new InvalidImageError("not_an_image");
  }
  if (!meta.format || !["png", "jpeg", "webp"].includes(meta.format) || !meta.width || !meta.height) {
    throw new InvalidImageError("unsupported_format");
  }
  return sharp(input, { limitInputPixels: 25_000_000 })
    .rotate()
    .resize({ width: 800, height: 320, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function putObject(path: string, body: Buffer, contentType = "image/jpeg") {
  const { error } = await admin().storage.from(MEDIA_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function removeObjects(paths: (string | null | undefined)[]) {
  const clean = paths.filter((p): p is string => !!p);
  for (let i = 0; i < clean.length; i += 100) {
    const { error } = await admin().storage.from(MEDIA_BUCKET).remove(clean.slice(i, i + 100));
    if (error) throw new Error(`storage delete failed: ${error.message}`);
  }
}

/** Short-lived signed URLs, returned in the same order as the input. */
export async function signPaths(paths: (string | null)[], expiresIn = 60 * 60): Promise<(string | null)[]> {
  const wanted = paths.filter((p): p is string => !!p);
  if (wanted.length === 0) return paths.map(() => null);
  const map = new Map<string, string>();
  for (let i = 0; i < wanted.length; i += 500) {
    const { data, error } = await admin()
      .storage.from(MEDIA_BUCKET)
      .createSignedUrls(wanted.slice(i, i + 500), expiresIn);
    if (error) throw new Error(`signing failed: ${error.message}`);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
    }
  }
  return paths.map((p) => (p ? (map.get(p) ?? null) : null));
}

export async function signOne(path: string | null, expiresIn = 60 * 60): Promise<string | null> {
  return (await signPaths([path], expiresIn))[0];
}

/** Where the watermarked copy of a stored photo lives. */
export function watermarkedPath(path: string) {
  return path.replace(/\.jpg$/, ".wm.jpg");
}

/**
 * The file to show or download: the watermarked copy while the event is on
 * the free plan (if one was made), otherwise the clean one. Upgrading the
 * event switches every photo back to the clean file straight away.
 */
export function servedPath(path: string | null, photo: { watermarked: boolean }, event: { plan: string }) {
  if (!path) return null;
  return event.plan === "free" && photo.watermarked ? watermarkedPath(path) : path;
}

/** Every stored file for a photo, for deleting. */
export function allPhotoFiles(p: { storage_path: string | null; display_path: string | null; thumbnail_path: string | null }) {
  return [
    p.storage_path,
    p.display_path,
    p.thumbnail_path,
    p.storage_path && watermarkedPath(p.storage_path),
    p.display_path && watermarkedPath(p.display_path),
  ];
}

export function photoPaths(eventId: string, photoId: string) {
  const base = `${eventId}/photos/${photoId}`;
  return {
    original: `${base}/original.jpg`,
    display: `${base}/display.jpg`,
    thumb: `${base}/thumb.jpg`,
  };
}
