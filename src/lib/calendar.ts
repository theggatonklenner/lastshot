/** Calendar helpers for the save-the-date page. */

type CalEvent = {
  title: string;
  description?: string | null;
  starts_at: string | null;
  start_time: string | null;
  end_time: string | null;
};

/** When the event ends: its end time on the same night (or next morning), otherwise 4 hours after it starts. */
export function eventEndsAt(e: CalEvent): Date | null {
  if (!e.starts_at) return null;
  const start = new Date(e.starts_at);
  if (e.start_time && e.end_time) {
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    let diff = mins(e.end_time) - mins(e.start_time);
    if (diff <= 0) diff += 24 * 60;
    return new Date(start.getTime() + diff * 60_000);
  }
  return new Date(start.getTime() + 4 * 3600_000);
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(e: CalEvent, link: string) {
  if (!e.starts_at) return null;
  const end = eventEndsAt(e)!;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${stamp(new Date(e.starts_at))}/${stamp(end)}`,
    details: `Your disposable camera for ${e.title}: ${link}`,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function icsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function icsFile(e: CalEvent & { id: string }, link: string) {
  if (!e.starts_at) return null;
  const end = eventEndsAt(e)!;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lastshot//Save the date//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@lastshot.app`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(new Date(e.starts_at))}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(`Your disposable camera for ${e.title}: ${link}`)}`,
    `URL:${link}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(`${e.title} starts in an hour`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
