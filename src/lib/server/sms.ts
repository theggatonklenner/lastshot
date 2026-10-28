import "server-only";

/** Text messages through ClickSend (an Australian SMS provider). */

export function smsConfigured() {
  return !!process.env.CLICKSEND_USERNAME && !!process.env.CLICKSEND_API_KEY;
}

export type OutgoingSms = { to: string; body: string; ref: string };

/**
 * Sends up to 1,000 texts in one request. Returns which refs were accepted.
 * SMS_FROM can be a registered sender name (like "Lastshot") or a number;
 * leave it unset to use ClickSend's shared number.
 */
export async function sendSmsBatch(
  messages: OutgoingSms[],
): Promise<{ ok: true; accepted: Set<string>; errors: Map<string, string> } | { ok: false; error: string }> {
  if (!smsConfigured()) return { ok: false, error: "SMS isn't set up (CLICKSEND_USERNAME and CLICKSEND_API_KEY)." };
  if (messages.length === 0) return { ok: true, accepted: new Set(), errors: new Map() };
  const auth = Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString("base64");
  const from = process.env.SMS_FROM || undefined;
  try {
    const res = await fetch("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: messages.map((m) => ({ source: "lastshot", to: m.to, body: m.body, custom_string: m.ref, ...(from ? { from } : {}) })),
      }),
    });
    const json = (await res.json().catch(() => null)) as {
      response_code?: string;
      response_msg?: string;
      data?: { messages?: { custom_string?: string; status?: string }[] };
    } | null;
    if (!res.ok || !json?.data?.messages) {
      return { ok: false, error: `ClickSend ${res.status}: ${json?.response_msg ?? json?.response_code ?? "request failed"}`.slice(0, 300) };
    }
    const accepted = new Set<string>();
    const errors = new Map<string, string>();
    for (const m of json.data.messages) {
      if (!m.custom_string) continue;
      if (m.status === "SUCCESS") accepted.add(m.custom_string);
      else errors.set(m.custom_string, m.status ?? "FAILED");
    }
    return { ok: true, accepted, errors };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** The "photos are ready" text. Kept short so it fits in one or two messages. */
export function galleryReadySms(eventTitle: string, galleryUrl: string) {
  const title = eventTitle.length > 32 ? `${eventTitle.slice(0, 31)}…` : eventTitle;
  return `${title}: your photos are ready. See them here: ${galleryUrl}`;
}

/** ClickSend account balance, or null if it can't be read. */
export async function smsBalance(): Promise<{ balance: string; currency: string } | null> {
  if (!smsConfigured()) return null;
  const auth = Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString("base64");
  try {
    const res = await fetch("https://rest.clicksend.com/v3/account", {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { balance?: string | number; _currency?: { currency_name_short?: string } } };
    if (json.data?.balance === undefined) return null;
    return { balance: String(json.data.balance), currency: json.data._currency?.currency_name_short ?? "AUD" };
  } catch {
    return null;
  }
}
