import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { getEventByCode, getGuestForEvent, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { sendDueGalleryEmails } from "@/lib/server/gallery-emails";

const Body = z.object({ email: z.email().max(254) });

/** Guest asks to be emailed when the gallery is ready. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/notify">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return guestError("guest_not_found");
  if (!(await rateLimit(`notify:${guest.id}`, 10, 3600))) return guestError("rate_limited");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "invalid_email", "That email address doesn't look right.");

  const { error } = await admin().rpc("add_guest_email", { p_guest_id: guest.id, p_email: parsed.data.email });
  if (error) {
    if (error.message.includes("emails_disabled")) {
      return jsonError(403, "emails_disabled", "This event isn't collecting emails.");
    }
    if (error.message.includes("too_many_emails")) {
      return jsonError(409, "too_many_emails", "You've already added three addresses.");
    }
    if (error.message.includes("guest_blocked")) return guestError("guest_blocked");
    return guestError("server_error");
  }
  // If the gallery is already ready, send straight away.
  after(() => sendDueGalleryEmails({ eventId: event.id, limit: 20 }).catch(() => {}));
  return Response.json({ ok: true, email: parsed.data.email.toLowerCase().trim() });
}

/** The current guest's own saved addresses. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/e/[code]/notify">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return Response.json({ ok: true, emails: [] });
  const { data } = await admin()
    .from("guest_emails")
    .select("email, sent_at, unsubscribed_at")
    .eq("guest_id", guest.id)
    .is("unsubscribed_at", null);
  return Response.json({ ok: true, emails: (data ?? []).map((r) => ({ email: r.email, sent: !!r.sent_at })) });
}
