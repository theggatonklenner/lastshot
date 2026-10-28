import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { getEventByCode, getGuestForEvent, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";

const Body = z.object({
  endpoint: z.url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

/** Saves this phone's push subscription for the "photos are ready" alert. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/push">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  if (event.gallery_visibility === "private") return jsonError(403, "private", "This gallery is private.");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return guestError("guest_not_found");
  if (!(await rateLimit(`push:${guest.id}`, 10, 3600))) return guestError("rate_limited");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Notifications aren't supported on this browser.");
  const { error } = await admin()
    .from("guest_push")
    .upsert(
      { event_id: event.id, guest_id: guest.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
      { onConflict: "event_id,endpoint" },
    );
  if (error) return guestError("server_error");
  after(() => sendDueGalleryEmails({ eventId: event.id, limit: 20 }).catch(() => {}));
  return Response.json({ ok: true });
}
