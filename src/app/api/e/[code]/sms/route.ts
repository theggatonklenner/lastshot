import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { getEventByCode, getGuestForEvent, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";
import { formatPhone, normalisePhone } from "@/lib/phone";

const Body = z.object({ phone: z.string().max(32) });

/** Guest asks for a text when the gallery is ready (SMS alerts add-on). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/sms">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return guestError("guest_not_found");
  if (!(await rateLimit(`sms:${guest.id}`, 6, 3600))) return guestError("rate_limited");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  const phone = parsed.success ? normalisePhone(parsed.data.phone) : null;
  if (!phone) return jsonError(400, "invalid_phone", "Enter a mobile number, like 0412 345 678.");
  // Texts go through an Australian provider, so only Australian mobiles for now.
  if (!phone.startsWith("+614")) return jsonError(400, "invalid_phone", "Text alerts only work with Australian mobiles. Leave an email instead.");

  const { error } = await admin().rpc("add_guest_phone", { p_guest_id: guest.id, p_phone: phone });
  if (error) {
    if (error.message.includes("sms_disabled")) return jsonError(403, "sms_disabled", "This event isn't sending texts.");
    if (error.message.includes("too_many_numbers")) return jsonError(409, "too_many_numbers", "You've already added two numbers.");
    if (error.message.includes("sms_full")) return jsonError(409, "sms_full", "Text alerts are full for this event. Leave an email instead.");
    if (error.message.includes("guest_blocked")) return guestError("guest_blocked");
    return guestError("server_error");
  }
  after(() => sendDueGalleryEmails({ eventId: event.id, limit: 20 }).catch(() => {}));
  return Response.json({ ok: true, phone: formatPhone(phone) });
}

/** The current guest's own saved numbers. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/e/[code]/sms">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return Response.json({ ok: true, phones: [] });
  const { data } = await admin().from("guest_sms").select("phone").eq("guest_id", guest.id).is("unsubscribed_at", null);
  return Response.json({ ok: true, phones: (data ?? []).map((r) => formatPhone(r.phone)) });
}
