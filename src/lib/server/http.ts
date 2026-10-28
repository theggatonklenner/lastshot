import "server-only";

export function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ ok: false, code, message, ...extra }, { status });
}

export const GUEST_ERROR_MESSAGES: Record<string, { status: number; message: string }> = {
  event_not_found: { status: 404, message: "This event link doesn't exist. Check the QR code or link." },
  event_closed: { status: 409, message: "This event isn't taking photos any more." },
  guest_blocked: { status: 403, message: "The organiser has turned off this camera." },
  guest_not_found: { status: 401, message: "Join the event before taking photos." },
  access_code_invalid: { status: 403, message: "That access code doesn't match. Ask the organiser." },
  limit_reached: { status: 409, message: "You've used every shot on this camera." },
  library_disabled: { status: 403, message: "This event only accepts photos taken with the camera." },
  rate_limited: { status: 429, message: "Too many tries. Wait a minute and try again." },
  server_error: { status: 500, message: "Something went wrong on our side. Try again." },
};

export function guestError(code: string, extra?: Record<string, unknown>) {
  const e = GUEST_ERROR_MESSAGES[code] ?? GUEST_ERROR_MESSAGES.server_error;
  return jsonError(e.status, code, e.message, extra);
}
