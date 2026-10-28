import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { ownedEventForApi } from "@/lib/server/organiser";
import { jsonError } from "@/lib/server/http";
import { admin } from "@/lib/supabase/admin";
import { InvalidImageError, processLogo, putObject, removeObjects, signOne } from "@/lib/server/media";

export const maxDuration = 30;

/** Uploads the organiser's logo (Your branding add-on). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[id]/logo">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  if (!owned.event.addon_branding) return jsonError(403, "addon_required", "Add the Your branding add-on first.");

  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File) || file.size === 0) return jsonError(400, "bad_request", "Choose an image.");
  if (file.size > 2 * 1024 * 1024) return jsonError(413, "too_large", "Use a logo under 2 MB.");

  let png: Buffer;
  try {
    png = await processLogo(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof InvalidImageError) return jsonError(415, "invalid_image", "Use a PNG, JPG or WebP image.");
    throw e;
  }

  const path = `${owned.event.id}/brand/${randomUUID()}.png`;
  await putObject(path, png, "image/png");
  // The logo path is set by the server, not by organisers directly.
  const { error } = await admin().from("events").update({ brand_logo_path: path }).eq("id", owned.event.id);
  if (error) {
    await removeObjects([path]);
    return jsonError(500, "server_error", "The logo didn't save. Try again.");
  }
  if (owned.event.brand_logo_path) await removeObjects([owned.event.brand_logo_path]).catch(() => {});
  return Response.json({ ok: true, url: await signOne(path) });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/events/[id]/logo">) {
  const { id } = await ctx.params;
  const owned = await ownedEventForApi(id);
  if (!owned) return jsonError(404, "not_found", "Event not found.");
  if (owned.event.brand_logo_path) {
    await admin().from("events").update({ brand_logo_path: null }).eq("id", owned.event.id);
    await removeObjects([owned.event.brand_logo_path]).catch(() => {});
  }
  return Response.json({ ok: true });
}
