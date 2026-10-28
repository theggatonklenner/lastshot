import "server-only";
import sharp, { type Metadata } from "sharp";
import { admin, MEDIA_BUCKET } from "@/lib/supabase/admin";

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
};

/**
 * Validates the bytes are a real image of a sane size, then re-encodes it.
 * Re-encoding strips metadata (including GPS location) and neutralises
 * anything smuggled inside the file.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
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

  const base = () => sharp(input, { limitInputPixels: 50_000_000 }).rotate();

  const { data: original, info } = await base()
    .resize({ width: 3200, height: 3200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const display = await base()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  const thumb = await base()
    .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72, mozjpeg: true })
    .toBuffer();

  return { original, display, thumb, width: info.width, height: info.height };
}

export async function putObject(path: string, body: Buffer) {
  const { error } = await admin().storage.from(MEDIA_BUCKET).upload(path, body, {
    contentType: "image/jpeg",
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

export function photoPaths(eventId: string, photoId: string) {
  const base = `${eventId}/photos/${photoId}`;
  return {
    original: `${base}/original.jpg`,
    display: `${base}/display.jpg`,
    thumb: `${base}/thumb.jpg`,
  };
}
