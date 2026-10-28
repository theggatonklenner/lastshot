import type { NextRequest } from "next/server";
import { getEventByCode, getGuestForEvent } from "@/lib/server/guest";
import { guestError } from "@/lib/server/http";
import { RETAKES_PER_ROLL, acceptingSubmissions, mysteryUnlocked, shotLimit } from "@/lib/rules";
import { mysteryPromptFor } from "@/lib/mystery";

/** Server-confirmed shot count for the current guest. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/e/[code]/me">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return guestError("event_not_found");
  const guest = await getGuestForEvent(event, code);
  return Response.json(
    {
      ok: true,
      accepting: acceptingSubmissions(event),
      guest: guest
        ? {
            displayName: guest.display_name,
            blocked: guest.blocked,
            shotsUsed: guest.photos_submitted,
            shotsLimit: shotLimit(event),
            retakesLeft: Math.max(0, RETAKES_PER_ROLL - guest.retakes_used),
            mystery: mysteryUnlocked(event) ? mysteryPromptFor(event.mystery_prompt, guest.id) : null,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
