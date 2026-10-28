import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { admin } from "@/lib/supabase/admin";
import type { EventRecord, GuestRecord } from "@/lib/database.types";

export const EVENT_CODE_RE = /^[A-Za-z0-9]{12}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const GUEST_HEADER = "x-lastshot-guest";

export function guestCookieName(code: string) {
  return `ls_g_${code}`;
}

export function newGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * The guest token lives in an httpOnly cookie. The browser also keeps a copy in
 * localStorage and sends it as a header, which recovers the identity if the
 * cookie was cleared (for example by Safari's tracking prevention).
 */
export async function readGuestToken(code: string): Promise<string | null> {
  const jar = await cookies();
  const fromCookie = jar.get(guestCookieName(code))?.value;
  if (fromCookie && TOKEN_RE.test(fromCookie)) return fromCookie;
  const h = await headers();
  const fromHeader = h.get(GUEST_HEADER);
  if (fromHeader && TOKEN_RE.test(fromHeader)) return fromHeader;
  return null;
}

export async function setGuestCookie(code: string, token: string) {
  const jar = await cookies();
  jar.set(guestCookieName(code), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
}

export function viewPassCookieName(code: string) {
  return `ls_v_${code}`;
}

export function isTokenShape(token: string) {
  return TOKEN_RE.test(token);
}

/** A private gallery link from a "photos are ready" email, saved as a cookie. */
export async function hasViewPass(event: EventRecord, code: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(viewPassCookieName(code))?.value;
  if (!token || !TOKEN_RE.test(token)) return false;
  const { data } = await admin()
    .from("guest_emails")
    .select("id")
    .eq("event_id", event.id)
    .eq("view_token_hash", hashToken(token))
    .maybeSingle();
  return !!data;
}

export async function getEventByCode(code: string): Promise<EventRecord | null> {
  if (!EVENT_CODE_RE.test(code)) return null;
  const { data } = await admin().from("events").select("*").eq("code", code).maybeSingle();
  return data;
}

export async function getGuestForEvent(event: EventRecord, code: string): Promise<GuestRecord | null> {
  const token = await readGuestToken(code);
  if (!token) return null;
  const { data } = await admin()
    .from("event_guests")
    .select("*")
    .eq("event_id", event.id)
    .eq("guest_token_hash", hashToken(token))
    .maybeSingle();
  return data;
}

/** Fixed-window rate limit backed by Postgres. Returns true when allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await admin().rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate limit check failed", error.message);
    return true; // fail open rather than lock everyone out
  }
  return data === true;
}

/** Postgres raises named errors from the guest functions; map them for clients. */
export function dbErrorCode(message: string | undefined): string {
  const known = [
    "event_not_found",
    "event_closed",
    "guest_blocked",
    "guest_not_found",
    "access_code_invalid",
    "limit_reached",
    "library_disabled",
  ];
  return known.find((k) => message?.includes(k)) ?? "server_error";
}

/**
 * Event and current guest in one round of parallel queries (the upload path is
 * latency sensitive). The guest is looked up by token hash and then checked
 * against the event.
 */
export async function getEventAndGuest(code: string): Promise<{ event: EventRecord | null; guest: GuestRecord | null }> {
  if (!EVENT_CODE_RE.test(code)) return { event: null, guest: null };
  const token = await readGuestToken(code);
  const [eventRes, guestRes] = await Promise.all([
    admin().from("events").select("*").eq("code", code).maybeSingle(),
    token
      ? admin().from("event_guests").select("*").eq("guest_token_hash", hashToken(token)).limit(5)
      : Promise.resolve({ data: [] as GuestRecord[] }),
  ]);
  const event = eventRes.data;
  const guest = event ? ((guestRes.data ?? []).find((g) => g.event_id === event.id) ?? null) : null;
  return { event, guest };
}
