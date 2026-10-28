import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getUser } from "@/lib/supabase/server";
import { jsonError } from "@/lib/server/http";
import { admin } from "@/lib/supabase/admin";
import { InvalidImageError, processLogo, putObject, removeObjects, signOne } from "@/lib/server/media";

export const maxDuration = 30;

/** The organiser's own logo, copied onto each event they brand from a pack. */
export async function POST(req: NextRequest) {
  const { user } = await getUser();
  if (!user) return jsonError(401, "unauthorised", "Log in first.");
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
  const db = admin();
  const { data: profile } = await db.from("profiles").select("brand_logo_path").eq("id", user.id).maybeSingle();
  const path = `accounts/${user.id}/${randomUUID()}.png`;
  await putObject(path, png, "image/png");
  const { error } = await db.from("profiles").update({ brand_logo_path: path }).eq("id", user.id);
  if (error) {
    await removeObjects([path]);
    return jsonError(500, "server_error", "The logo didn't save. Try again.");
  }
  if (profile?.brand_logo_path) await removeObjects([profile.brand_logo_path]).catch(() => {});
  return Response.json({ ok: true, url: await signOne(path) });
}

export async function DELETE() {
  const { user } = await getUser();
  if (!user) return jsonError(401, "unauthorised", "Log in first.");
  const db = admin();
  const { data: profile } = await db.from("profiles").select("brand_logo_path").eq("id", user.id).maybeSingle();
  if (profile?.brand_logo_path) {
    await db.from("profiles").update({ brand_logo_path: null }).eq("id", user.id);
    await removeObjects([profile.brand_logo_path]).catch(() => {});
  }
  return Response.json({ ok: true });
}
