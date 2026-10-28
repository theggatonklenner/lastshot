import Link from "next/link";

const fmt = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric" });

/** How long photos are kept, with a link to the 2-year add-on. */
export function KeepPhotos({
  eventId,
  keep,
  deleteAfter,
  ended,
  extended,
}: {
  eventId: string;
  keep: boolean;
  /** ISO date photos will be deleted, computed on the server; null when kept. */
  deleteAfter: string | null;
  ended: boolean;
  extended: boolean;
}) {
  const period = extended ? "2 years" : "180 days";
  const description = keep
    ? "Photos stay until you delete them or the event."
    : ended && deleteAfter
      ? `Photos will be deleted automatically on ${fmt.format(new Date(deleteAfter))}. You'll get an email two weeks before.`
      : `Photos are deleted automatically ${period} after the event ends. You'll get an email two weeks before.`;

  return (
    <div className="flex flex-col gap-1 py-3">
      <p className="font-semibold">{extended ? "Photos kept for 2 years" : "Photos kept for 180 days"}</p>
      <p className="text-sm text-graphite">{description}</p>
      {!extended && !keep && (
        <Link href={`/dashboard/events/${eventId}/upgrade#addons`} className="mt-1 self-start text-sm font-semibold text-cobalt hover:underline">
          Keep them for 2 years
        </Link>
      )}
    </div>
  );
}
