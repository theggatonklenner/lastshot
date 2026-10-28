import { after, type NextRequest } from "next/server";
import { notifyEventFull } from "@/lib/server/plan-notices";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import {
  clientIp,
  dbErrorCode,
  getEventByCode,
  hashIp,
  hashToken,
  newGuestToken,
  rateLimit,
  readGuestToken,
  setGuestCookie,
} from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { shotLimit } from "@/lib/rules";
import { checkAnswers } from "@/lib/lead-questions";

const Body = z.object({
  displayName: z.string().trim().max(40).optional().nullable(),
  accessCode: z.string().trim().max(32).optional().nullable(),
  consent: z.literal(true),
  /** Answers to the organiser's questions (Guest data export add-on). Sent by the join form, not by a resume. */
  answers: z.record(z.string(), z.string().max(200)).optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/join">) {
  const { code } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(400, "bad_request", "Agree to the event rules to continue.");
  }

  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");

  const questions = event.addon_export ? (event.lead_questions ?? []) : [];
  let answers: Record<string, string> | null = null;
  if (parsed.data.answers && questions.length) {
    const checked = checkAnswers(questions, parsed.data.answers);
    if (!checked.ok) return jsonError(400, "answers_required", checked.error);
    answers = checked.answers;
  }

  const ip = hashIp(await clientIp());
  // Limits how many fresh camera identities one network can create, which is
  // the main way someone would try to get extra shots.
  const allowed =
    (await rateLimit(`join:${event.id}:${ip}`, 40, 3600)) && (await rateLimit(`join-ip:${ip}`, 120, 3600));
  if (!allowed) return guestError("rate_limited");

  const token = (await readGuestToken(code)) ?? newGuestToken();
  const { data: guest, error } = await admin().rpc("guest_join", {
    p_event_id: event.id,
    p_token_hash: hashToken(token),
    p_display_name: parsed.data.displayName ?? null,
    p_access_code: parsed.data.accessCode ?? null,
  });
  if (error || !guest) {
    const errCode = dbErrorCode(error?.message);
    if (errCode === "event_full") after(() => notifyEventFull(event.id));
    return guestError(errCode);
  }

  if (answers && Object.keys(answers).length) {
    await admin()
      .from("event_guests")
      .update({ lead_answers: { ...(guest.lead_answers ?? {}), ...answers } })
      .eq("id", guest.id);
  }

  await setGuestCookie(code, token);
  return Response.json({
    ok: true,
    token,
    guest: {
      displayName: guest.display_name,
      shotsUsed: guest.photos_submitted,
      shotsLimit: shotLimit(event),
    },
  });
}
