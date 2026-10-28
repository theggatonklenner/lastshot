const dateFmt = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

export function formatEventDate(date: string | null, start?: string | null, end?: string | null): string {
  if (!date) return "Date not set";
  const [y, m, d] = date.split("-").map(Number);
  const base = dateFmt.format(new Date(y, m - 1, d));
  const t = (s: string) => {
    const [h, min] = s.split(":").map(Number);
    const suffix = h >= 12 ? "pm" : "am";
    const hh = h % 12 === 0 ? 12 : h % 12;
    return min ? `${hh}:${String(min).padStart(2, "0")}${suffix}` : `${hh}${suffix}`;
  };
  if (start && end) return `${base}, ${t(start)} to ${t(end)}`;
  if (start) return `${base}, from ${t(start)}`;
  return base;
}

export function formatDateTime(iso: string | null, timeZone?: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function pluralise(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Converts a <input type="datetime-local"> value (browser local time) to ISO. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO to a datetime-local input value in the browser's time zone. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
