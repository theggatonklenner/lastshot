import { NextResponse, type NextRequest } from "next/server";
import { CODE_COOKIE, cleanCode } from "@/lib/server/discounts";

/**
 * lastshot.app/go/<code>: saves a referral or venue code for checkout, then
 * carries on to the home page (or a safe `next` path).
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/go/[code]">) {
  const { code } = await ctx.params;
  const clean = cleanCode(decodeURIComponent(code));
  const next = req.nextUrl.searchParams.get("next") ?? "/";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(safe, req.nextUrl.origin));
  if (/^[A-Z0-9-]{4,24}$/.test(clean)) {
    res.cookies.set(CODE_COOKIE, clean, { maxAge: 60 * 60 * 24 * 60, sameSite: "lax", path: "/", httpOnly: true, secure: true });
  }
  return res;
}
