import "server-only";
import { createHash } from "node:crypto";
import { admin } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/env";
import { emailConfigured, organiserNoticeEmail, sendBatch } from "@/lib/server/email";

export type ErrorReport = {
  source: "server" | "client";
  message: string;
  path?: string | null;
  route?: string | null;
  digest?: string | null;
  detail?: string | null;
};

/** Groups repeats of the same error: numbers, ids and codes are stripped before hashing. */
function fingerprint(r: ErrorReport): string {
  const normalised = r.message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "<token>")
    .replace(/\d+/g, "<n>")
    .slice(0, 300);
  return createHash("sha256").update(`${r.source}|${r.route ?? ""}|${normalised}`).digest("hex");
}

/** Strips query strings, which can contain tokens, from logged paths. */
function cleanPath(path?: string | null) {
  if (!path) return null;
  return path.split("?")[0].replace(/\/(g|unsubscribe|invite)\/[^/]+/, "/$1/<token>").slice(0, 500);
}

/**
 * Logs an error and emails site admins the first time it happens (and again
 * if it comes back after a quiet hour). Never throws.
 */
export async function recordError(r: ErrorReport): Promise<void> {
  try {
    const db = admin();
    const { data: shouldAlert } = await db.rpc("log_app_error", {
      p_fingerprint: fingerprint(r),
      p_source: r.source,
      p_message: r.message.slice(0, 1000) || "Unknown error",
      p_path: cleanPath(r.path),
      p_digest: r.digest?.slice(0, 100) ?? null,
      p_detail: r.detail?.slice(0, 4000) ?? null,
    });
    if (!shouldAlert || !emailConfigured()) return;

    const { data: admins } = await db.from("profiles").select("email").eq("is_admin", true);
    const to = [...new Set([process.env.ALERT_EMAIL, ...(admins ?? []).map((a) => a.email)].filter(Boolean))] as string[];
    if (!to.length) return;
    const mail = organiserNoticeEmail({
      heading: `Lastshot error: ${r.message.slice(0, 80)}`,
      lines: [
        `Where: ${r.source === "server" ? "server" : "a visitor's browser"}${r.route ? `, ${r.route}` : ""}${cleanPath(r.path) ? ` (${cleanPath(r.path)})` : ""}.`,
        "You'll get another email only if it keeps happening after an hour.",
      ],
      buttonLabel: "See errors",
      buttonUrl: `${siteUrl()}/admin/errors`,
    });
    await sendBatch(to.slice(0, 10).map((addr) => ({ to: addr, subject: mail.subject, html: mail.html, text: mail.text })));
  } catch (e) {
    console.error("error logging failed", e);
  }
}
