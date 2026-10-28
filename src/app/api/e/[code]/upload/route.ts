import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { dbErrorCode, getEventByCode, getGuestForEvent, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { InvalidImageError, MAX_UPLOAD_BYTES, photoPaths, processImage, putObject } from "@/lib/server/media";

export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One photo per request. Order of operations:
 * 1. verify guest + validate the image bytes
 * 2. claim a shot atomically in Postgres (idempotent on clientUploadId)
 * 3. write the three sizes to private storage
 * 4. mark the photo complete; only then report success
 * If storage fails the shot is released so the guest can retry.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/upload">) {
  const { code } = await ctx.params;

  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return jsonError(413, "too_large", "That photo is too large. Try again.");
  }

  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return guestError("guest_not_found");
  if (guest.blocked) return guestError("guest_blocked");

  if (!(await rateLimit(`upload:${guest.id}`, 30, 60))) return guestError("rate_limited");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "bad_request", "The upload was incomplete. Try again.");
  }
  const file = form.get("photo");
  const clientUploadId = String(form.get("clientUploadId") ?? "");
  const capturedAtRaw = String(form.get("capturedAt") ?? "");
  const source = form.get("source") === "library" ? "library" : "camera";

  if (!(file instanceof File) || !UUID_RE.test(clientUploadId)) {
    return jsonError(400, "bad_request", "The upload was incomplete. Try again.");
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, "too_large", "That photo is too large. Try again.");
  }
  const capturedAt = Number.isNaN(Date.parse(capturedAtRaw)) ? new Date() : new Date(capturedAtRaw);
  // Ignore clocks that are wildly off.
  const capturedIso =
    Math.abs(capturedAt.getTime() - Date.now()) > 1000 * 60 * 60 * 24 * 7
      ? new Date().toISOString()
      : capturedAt.toISOString();

  let processed;
  try {
    processed = await processImage(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    if (e instanceof InvalidImageError) {
      return jsonError(415, "invalid_image", "That file isn't a photo we can use.");
    }
    throw e;
  }

  const { data: claimRows, error: claimError } = await admin().rpc("claim_photo_slot", {
    p_guest_id: guest.id,
    p_client_upload_id: clientUploadId,
    p_captured_at: capturedIso,
    p_source: source,
  });
  const claim = claimRows?.[0];
  if (claimError || !claim) {
    const codeName = dbErrorCode(claimError?.message);
    return guestError(codeName, {
      shotsUsed: guest.photos_submitted,
      shotsLimit: event.photos_per_guest,
    });
  }

  if (claim.result === "duplicate") {
    return Response.json({
      ok: true,
      photoId: claim.photo_id,
      duplicate: true,
      shotsUsed: claim.shots_used,
      shotsLimit: claim.shots_limit,
    });
  }

  const paths = photoPaths(event.id, claim.photo_id);
  try {
    await putObject(paths.original, processed.original);
    await putObject(paths.display, processed.display);
    await putObject(paths.thumb, processed.thumb);
    const { error } = await admin().rpc("complete_photo_upload", {
      p_photo_id: claim.photo_id,
      p_storage_path: paths.original,
      p_display_path: paths.display,
      p_thumbnail_path: paths.thumb,
      p_width: processed.width,
      p_height: processed.height,
      p_file_size: processed.original.length,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("upload failed", e);
    await admin().rpc("release_photo_slot", { p_photo_id: claim.photo_id });
    return jsonError(503, "storage_failed", "The photo didn't save. It's still on your phone, so try again.", {
      retryable: true,
    });
  }

  return Response.json({
    ok: true,
    photoId: claim.photo_id,
    duplicate: false,
    shotsUsed: claim.shots_used,
    shotsLimit: claim.shots_limit,
  });
}
