import type { NextRequest } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { clientIp, getEventByCode, hashIp, hashToken, rateLimit, readGuestToken, readViewPassToken } from "@/lib/server/guest";
import { guestError, jsonError } from "@/lib/server/http";
import { resolveGalleryViewer } from "@/lib/server/gallery";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";

const Body = z.object({
  photoId: z.uuid(),
  reason: z.enum(["inappropriate", "privacy", "other"]),
  details: z.string().trim().max(300).optional().nullable(),
});

const REASON_TEXT = {
  inappropriate: "it's inappropriate",
  privacy: "they're in it and want it removed",
  other: "another reason",
};

/** A guest, or someone with a gallery link, reports a photo they can see. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/e/[code]/report">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event) return guestError("event_not_found");

  const { isOwner, access } = await resolveGalleryViewer(event, code);
  if (!access.allowed || isOwner) return jsonError(403, "not_allowed", "You can't report photos here.");

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "bad_request", "Choose a reason.");

  // One report per photo per person: keyed on their camera, their email link, or (public galleries) their network.
  const identity = (await readGuestToken(code)) ?? (await readViewPassToken(code)) ?? `ip:${hashIp(await clientIp())}:${event.id}`;
  const reporterKey = hashToken(`report:${identity}`);
  if (!(await rateLimit(`report:${reporterKey}`, 20, 3600))) return guestError("rate_limited");

  const { data, error } = await admin().rpc("report_photo", {
    p_photo_id: parsed.data.photoId,
    p_event_id: event.id,
    p_reporter_key: reporterKey,
    p_reason: parsed.data.reason,
    p_details: parsed.data.details ?? null,
  });
  if (error) return jsonError(404, "photo_not_found", "That photo isn't available any more.");
  const result = data?.[0];

  // Tell the organiser about a newly reported photo (at most every 15 minutes per event).
  if (result?.first_report && emailConfigured()) {
    after(async () => {
      if (!(await rateLimit(`report-email:${event.id}`, 1, 900))) return;
      const { data: owner } = await admin().from("profiles").select("email").eq("id", event.owner_id).maybeSingle();
      if (!owner?.email) return;
      const mail = organiserNoticeEmail({
        heading: `A photo in ${event.title} was reported`,
        lines: [
          `A guest reported a photo because ${REASON_TEXT[parsed.data.reason]}.`,
          "It's still visible for now and is flagged in your dashboard. If three people report it, it's hidden until you review it.",
        ],
        eyebrow: "Photo reported",
        buttonLabel: "Review flagged photos",
        buttonUrl: `${siteUrl()}/dashboard/events/${event.id}/photos?filter=flagged`,
      });
      await sendBatch([{ to: owner.email, subject: mail.subject, html: mail.html, text: mail.text }]);
    });
  }

  return Response.json({ ok: true, hidden: !!result?.hidden });
}
