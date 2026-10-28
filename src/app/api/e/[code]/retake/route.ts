import type { NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { dbErrorCode, getEventAndGuest, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { allPhotoFiles, removeObjects } from "@/lib/server/media";
import { shotLimit } from "@/lib/rules";

/** Deletes the guest's last photo and gives the shot back (one retake per roll). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/e/[code]/retake">) {
  const { code } = await ctx.params;
  const { event, guest } = await getEventAndGuest(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  if (!guest) return guestError("guest_not_found");
  if (!(await rateLimit(`retake:${guest.id}`, 5, 600))) return guestError("rate_limited");

  const { data, error } = await admin().rpc("retake_last_photo", { p_guest_id: guest.id });
  if (error || !data?.[0]) {
    const msg = error?.message ?? "";
    if (msg.includes("no_retakes_left")) return jsonError(409, "no_retakes_left", "You've already used your retake.");
    if (msg.includes("nothing_to_retake")) {
      return jsonError(409, "nothing_to_retake", "There's no recent photo to retake. Retakes work for 10 minutes after a shot.");
    }
    return guestError(dbErrorCode(msg));
  }
  const row = data[0];
  await removeObjects(allPhotoFiles(row)).catch((e) => console.error("retake file cleanup", e));
  return Response.json({ ok: true, shotsUsed: row.shots_used, shotsLimit: shotLimit(event), retakesLeft: 0 });
}
