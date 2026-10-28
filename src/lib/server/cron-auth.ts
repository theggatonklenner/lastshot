import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * With CRON_SECRET set, callers must send "Authorization: Bearer <secret>".
 * Without it the job endpoints are open, which is safe: each only does work
 * that is already due, exactly once, and they are rate limited.
 */
export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
