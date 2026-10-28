import type { NextRequest } from "next/server";
import { getEventByCode } from "@/lib/server/guest";

/**
 * Per-event web app manifest, so a guest who adds the event to their home
 * screen gets an app that reopens this event (and later its gallery).
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/e/[code]/manifest.webmanifest">) {
  const { code } = await ctx.params;
  const event = await getEventByCode(code);
  if (!event || event.status === "draft") return new Response("Not found", { status: 404 });

  const short = event.title.length > 12 ? "Lastshot" : event.title;
  return Response.json(
    {
      id: `/e/${code}`,
      name: `${event.title} | Lastshot`,
      short_name: short,
      description: `The camera and gallery for ${event.title}.`,
      start_url: `/e/${code}`,
      scope: `/e/${code}`,
      display: "standalone",
      orientation: "portrait",
      background_color: "#1d1e21",
      theme_color: "#1d1e21",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" } },
  );
}
