import type { NextRequest } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { getEventByCode, getGuestForEvent, rateLimit } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { normalisePhone } from "@/lib/phone";
import { MARKETING_CONSENT } from "@/lib/marketing";

const Body = z.object({ email: z.email().max(254).nullable().optional(), phone: z.string().max(32).nullable().optional() });

/** A guest opts in to news and offers from Lastshot (never pre-ticked). */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/marketing">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  if (!guest) return guestError("guest_not_found");
  if (!(await rateLimit(`marketing:${guest.id}`, 6, 3600))) return guestError("rate_limited");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Check your details.");
  const rows: { channel: "email" | "sms"; contact: string }[] = [];
  if (parsed.data.email) rows.push({ channel: "email", contact: parsed.data.email.trim().toLowerCase() });
  const phone = parsed.data.phone ? normalisePhone(parsed.data.phone) : null;
  if (phone?.startsWith("+614")) rows.push({ channel: "sms", contact: phone });
  if (!rows.length) return jsonError(400, "bad_request", "Add an email or Australian mobile.");

  const { error } = await admin()
    .from("marketing_contacts")
    .upsert(
      rows.map((r) => ({ ...r, event_id: event.id, consent_text: MARKETING_CONSENT, consented_at: new Date().toISOString() })),
      // Never overwrite an existing record: someone who unsubscribed stays unsubscribed,
      // and nobody can re-record consent for another person's address.
      { onConflict: "channel,contact", ignoreDuplicates: true },
    );
  if (error) return guestError("server_error");
  return Response.json({ ok: true });
}
