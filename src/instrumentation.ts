import type { Instrumentation } from "next";

export function register() {}

/** Server errors are logged and site admins are emailed (see lib/server/error-log). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordError } = await import("@/lib/server/error-log");
  const e = err as { message?: string; digest?: string; stack?: string };
  await recordError({
    source: "server",
    message: e?.message ?? String(err),
    digest: e?.digest ?? null,
    path: request.path,
    route: `${context.routeType} ${context.routePath}`,
    detail: e?.stack ?? null,
  });
};
