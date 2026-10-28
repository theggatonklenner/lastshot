import "server-only";

/** Text messages through ClickSend (an Australian SMS provider). */

/**
 * Text messages go through Texto (texto.com.au) when TEXTO_API_KEY is set,
 * otherwise ClickSend (CLICKSEND_USERNAME + CLICKSEND_API_KEY).
 */
export type SmsProvider = "texto" | "clicksend";

export function smsProvider(): SmsProvider | null {
  if (process.env.TEXTO_API_KEY) return "texto";
  if (process.env.CLICKSEND_USERNAME && process.env.CLICKSEND_API_KEY) return "clicksend";
  return null;
}

export function smsConfigured() {
  return smsProvider() !== null;
}

export type OutgoingSms = { to: string; body: string; ref: string };
type SendResult = { ok: true; accepted: Set<string>; errors: Map<string, string> } | { ok: false; error: string };

/**
 * Sends texts. Returns which refs were accepted, and why the others weren't.
 * SMS_FROM can be a registered sender name (like "Lastshot") or a number;
 * leave it unset to use the provider's default number.
 */
export async function sendSmsBatch(messages: OutgoingSms[]): Promise<SendResult> {
  const provider = smsProvider();
  if (!provider) return { ok: false, error: "SMS isn't set up (TEXTO_API_KEY)." };
  if (messages.length === 0) return { ok: true, accepted: new Set(), errors: new Map() };
  return provider === "texto" ? sendTexto(messages) : sendClickSend(messages);
}

const TEXTO_API = "https://api.texto.com.au";

async function textoError(res: Response) {
  const json = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
  const reason =
    json?.error ??
    json?.message ??
    ({ 401: "invalid API key", 402: "out of credits", 422: "invalid number", 429: "rate limited" } as Record<number, string>)[res.status] ??
    "request failed";
  return `Texto ${res.status}: ${reason}`.slice(0, 300);
}

/** One request per text (a few at a time), using Texto's documented /send endpoint. */
async function sendTexto(messages: OutgoingSms[]): Promise<SendResult> {
  const accepted = new Set<string>();
  const errors = new Map<string, string>();
  const from = process.env.SMS_FROM || undefined;
  let fatal: string | null = null;

  const sendOne = async (m: OutgoingSms) => {
    if (fatal) return errors.set(m.ref, fatal);
    try {
      const res = await fetch(`${TEXTO_API}/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.TEXTO_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: m.to, message: m.body, campaign: "Lastshot gallery ready", ...(from ? { sender: from } : {}) }),
        cache: "no-store",
      });
      if (res.ok) return accepted.add(m.ref);
      const err = await textoError(res);
      // Bad key or no credit affects every text: stop and report once.
      if (res.status === 401 || res.status === 402) fatal = err;
      errors.set(m.ref, err);
    } catch (e) {
      errors.set(m.ref, e instanceof Error ? e.message : "Network error");
    }
  };

  for (let i = 0; i < messages.length; i += 5) {
    await Promise.all(messages.slice(i, i + 5).map(sendOne));
  }
  if (fatal && accepted.size === 0) return { ok: false, error: fatal };
  return { ok: true, accepted, errors };
}

async function sendClickSend(messages: OutgoingSms[]): Promise<SendResult> {
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

/** Account balance from the SMS provider, or null if it can't be read. */
export async function smsBalance(): Promise<{ text: string } | null> {
  const provider = smsProvider();
  try {
    if (provider === "texto") {
      const res = await fetch(`${TEXTO_API}/balance`, {
        headers: { Authorization: `Bearer ${process.env.TEXTO_API_KEY}` },
        cache: "no-store",
      });
      if (!res.ok) return null;
      const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const d = (j.data && typeof j.data === "object" ? j.data : j) as Record<string, unknown>;
      const credits = d.credits ?? d.credits_remaining ?? d.balance;
      return { text: credits !== undefined ? `${credits} credits` : "Connected" };
    }
    if (provider === "clicksend") {
      const auth = Buffer.from(`${process.env.CLICKSEND_USERNAME}:${process.env.CLICKSEND_API_KEY}`).toString("base64");
      const res = await fetch("https://rest.clicksend.com/v3/account", { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: { balance?: string | number; _currency?: { currency_name_short?: string } } };
      if (json.data?.balance === undefined) return null;
      return { text: `${json.data._currency?.currency_name_short ?? "AUD"} ${Number(json.data.balance).toFixed(2)}` };
    }
  } catch {
    /* fall through */
  }
  return null;
}
