import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, hashIp, rateLimit } from "@/lib/server/guest";
import { recordError } from "@/lib/server/error-log";

const Body = z.object({
  message: z.string().max(1000),
  stack: z.string().max(4000).optional().nullable(),
  path: z.string().max(500).optional().nullable(),
  digest: z.string().max(100).optional().nullable(),
});

/**
 * Errors caused by in-app browsers (Snapchat, Instagram, Facebook, TikTok...)
 * and extensions injecting their own scripts, not by Lastshot. They're dropped
 * so they don't trigger alerts.
 */
const NOISE = [
  /SCDynimacBridge/i,
  /webkit\.messageHandlers/i,
  /instantSearchSDKJSBridgeClearHighlight/i,
  /__gCrWeb/i,
  /WeixinJSBridge/i,
  /zaloJSV2/i,
  /^Script error\.?$/i,
  /ResizeObserver loop/i,
  /chrome-extension:|moz-extension:|safari-extension:/i,
];

export function isBrowserNoise(message: string, stack?: string | null) {
  const text = `${message}\n${stack ?? ""}`;
  return NOISE.some((re) => re.test(text));
}

/** Browser errors reported by the error screens and the page-level listener. */
export async function POST(req: NextRequest) {
  if (!(await rateLimit(`client-error:${hashIp(await clientIp())}`, 10, 60))) {
    return new Response(null, { status: 204 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  if (isBrowserNoise(parsed.data.message, parsed.data.stack)) return new Response(null, { status: 204 });
  await recordError({
    source: "client",
    message: parsed.data.message,
    path: parsed.data.path,
    digest: parsed.data.digest,
    detail: [parsed.data.stack, req.headers.get("user-agent")].filter(Boolean).join("\n\n"),
  });
  return new Response(null, { status: 204 });
}
