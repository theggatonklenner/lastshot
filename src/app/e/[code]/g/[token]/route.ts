import { NextResponse, type NextRequest } from "next/server";
import { admin } from "@/lib/supabase/admin";
import { EVENT_CODE_RE, hashToken, isTokenShape, viewPassCookieName } from "@/lib/server/guest";

/** Private gallery link from the "photos are ready" email. Saves the pass and opens the gallery. */
export async function GET(req: NextRequest, ctx: RouteContext<"/e/[code]/g/[token]">) {
  const { code, token } = await ctx.params;
  const home = new URL(`/e/${EVENT_CODE_RE.test(code) ? code : ""}`, req.url);
  if (!EVENT_CODE_RE.test(code) || !isTokenShape(token)) return NextResponse.redirect(home);

  const { data: event } = await admin().from("events").select("id").eq("code", code).maybeSingle();
  if (!event) return NextResponse.redirect(home);
  const { data: row } = await admin()
    .from("guest_emails")
    .select("id")
    .eq("event_id", event.id)
    .eq("view_token_hash", hashToken(token))
    .maybeSingle();
  if (!row) return NextResponse.redirect(home);

  const res = NextResponse.redirect(new URL(`/e/${code}/gallery`, req.url));
  res.cookies.set(viewPassCookieName(code), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
