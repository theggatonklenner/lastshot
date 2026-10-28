/** Small, pure safety checks shared by routes (and covered by tests). */

/**
 * A redirect target that can only stay on this site. Browsers treat "\" and
 * stripped tabs or newlines as "/", so "/\evil.com" must be rejected.
 */
export function safeRedirectTarget(next: string | null | undefined, origin: string): URL {
  const home = new URL("/", origin);
  if (!next || !next.startsWith("/") || /[\\\u0000-\u001f]/.test(next)) return home;
  try {
    const u = new URL(next, origin);
    return u.origin === home.origin ? u : home;
  } catch {
    return home;
  }
}

/** Browser push services. The server only ever sends notifications to these hosts. */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
export function isPushServiceUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && !u.port && !u.username && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** One CSV cell, quoted when needed, with formula characters neutralised for spreadsheet apps. */
export function csvCell(v: string | number | null | undefined) {
  const raw = v === null || v === undefined ? "" : String(v);
  const s = /^[=+\-@\t\r]/.test(raw) && !/^[+-]?\d[\d.]*$/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
