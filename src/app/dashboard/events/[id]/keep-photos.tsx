import Link from "next/link";

const fmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** How long photos are kept, with a link to the 2-year add-on. */
export function KeepPhotos({
  eventId,
  keep,
  deleteAfter,
  ended,
  extended,
  oneYear,
}: {
  eventId: string;
  keep: boolean;
  /** ISO date photos will be deleted, computed on the server; null when kept. */
  deleteAfter: string | null;
  ended: boolean;
  extended: boolean;
  oneYear?: boolean;
}) {
  const period = extended ? "2 years" : oneYear ? "1 year" : "180 days";
  const description = keep
    ? "Photos stay until you delete them or the event."
    : ended && deleteAfter
      ? `Photos will be deleted automatically on ${fmt.format(new Date(deleteAfter))}. You'll get an email two weeks before.`
      : `Photos are deleted automatically ${period} after the event ends. You'll get an email two weeks before.`;

  return (
    <div className="flex flex-col gap-1 py-3">
      <p className="font-semibold">Photos kept for {period}</p>
      <p className="text-sm text-graphite">{description}</p>
      {!extended && !keep && (
        <Link href={`/dashboard/events/${eventId}/upgrade#addons`} className="mt-1 self-start text-sm font-semibold text-cobalt hover:underline">
          {oneYear ? "Keep them for 2 years" : "Keep them longer"}
        </Link>
      )}
    </div>
  );
}
