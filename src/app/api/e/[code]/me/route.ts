import type { NextRequest } from "next/server";
import { getEventByCode, getGuestForEvent } from "@/lib/server/guest";
import { guestError } from "@/lib/server/http";
import { acceptingSubmissions } from "@/lib/rules";

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
            shotsLimit: event.photos_per_guest,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
