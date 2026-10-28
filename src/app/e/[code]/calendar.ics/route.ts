import type { NextRequest } from "next/server";
import { getEventByCode } from "@/lib/server/guest";
import { eventUrl } from "@/lib/env";
import { icsFile } from "@/lib/calendar";

/** "Add to calendar" file for the save-the-date page. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/e/[code]/calendar.ics">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft" || event.suspended_at) return new Response("Not found", { status: 404 });
  const body = icsFile(event, eventUrl(event));
  if (!body) return new Response("This event has no start time.", { status: 404 });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${event.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "event"}.ics"`,
    },
  });
}
