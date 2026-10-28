/**
 * Turns what a guest typed into an E.164 number, e.g. "0412 345 678" -> "+61412345678".
 * Numbers without a country code are treated as Australian. Returns null if it
 * doesn't look like a mobile number.
 */
export function normalisePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  let e164: string;
  if (digits.startsWith("+")) e164 = "+" + digits.slice(1).replace(/\+/g, "");
  else if (digits.startsWith("00")) e164 = "+" + digits.slice(2);
  else if (/^04\d{8}$/.test(digits)) e164 = "+61" + digits.slice(1);
  else if (/^614\d{8}$/.test(digits)) e164 = "+" + digits;
  else return null;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) return null;
  // Australian numbers must be mobiles (04...).
  if (e164.startsWith("+61") && !/^\+614\d{8}$/.test(e164)) return null;
  return e164;
}

/** "+61412345678" -> "0412 345 678" for Australian mobiles, otherwise unchanged. */
export function formatPhone(e164: string) {
  const m = /^\+61(4\d{2})(\d{3})(\d{3})$/.exec(e164);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}
