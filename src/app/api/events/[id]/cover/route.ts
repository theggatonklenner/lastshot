import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { admin } from "@/lib/supabase/admin";
import { ownedEventForApi } from "@/lib/server/organiser";
import { jsonError } from "@/lib/server/http";
import { InvalidImageError, MAX_UPLOAD_BYTES, coverOriginalPath, processImage, putObject, removeObjects, signOne } from "@/lib/server/media";

export const maxDuration = 30;

export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[id]/cover">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("cover");
  if (!(file instanceof File) || file.size === 0) return jsonError(400, "bad_request", "Choose an image.");
  if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, "too_large", "Use an image under 4 MB.");

  // The browser sends the cropped cover plus, optionally, the full photo so it can be re-cropped later.
  const originalFile = form?.get("original");
  let original: Buffer | null = null;
  if (originalFile instanceof File && originalFile.size > 0 && originalFile.size <= MAX_UPLOAD_BYTES) {
    try {
      original = (await processImage(Buffer.from(await originalFile.arrayBuffer()))).original;
    } catch {
      original = null;
    }
  }

  let cover: Buffer;
  try {
    const processed = await processImage(Buffer.from(await file.arrayBuffer()));
    cover = await sharp(processed.original)
      .resize({ width: 1800, height: 1200, fit: "cover", position: "attention" })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    if (e instanceof InvalidImageError) return jsonError(415, "invalid_image", "That file isn't an image we can use.");
    throw e;
  }

  const path = `${owned.event.id}/cover/${randomUUID()}.jpg`;
  await putObject(path, cover);
  if (original) await putObject(coverOriginalPath(path), original).catch(() => {});
  // The path is set by the server after the ownership check above, not by organisers directly.
  const { error } = await admin().from("events").update({ cover_image_path: path }).eq("id", owned.event.id);
  if (error) {
    await removeObjects([path, coverOriginalPath(path)]);
    return jsonError(500, "server_error", "The cover didn't save. Try again.");
  }
  if (owned.event.cover_image_path) {
    await removeObjects([owned.event.cover_image_path, coverOriginalPath(owned.event.cover_image_path)]).catch(() => {});
  }

  return Response.json({ ok: true, url: await signOne(path), originalUrl: original ? await signOne(coverOriginalPath(path)) : null });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/events/[id]/cover">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  if (owned.event.cover_image_path) {
    await admin().from("events").update({ cover_image_path: null }).eq("id", owned.event.id);
    await removeObjects([owned.event.cover_image_path, coverOriginalPath(owned.event.cover_image_path)]).catch(() => {});
  }
  return Response.json({ ok: true });
}
