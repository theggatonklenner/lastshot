"use client";

import { useRouter } from "next/navigation";
import { Countdown } from "@/components/countdown";

/** Before the event: countdown to the start, and add it to a calendar. */
export function SaveTheDate({
  code,
  startsAt,
  whenText,
  locked,
  googleUrl,
}: {
  code: string;
  startsAt: string;
  whenText: string;
  /** Cameras can't be used until the start. */
  locked: boolean;
  googleUrl: string | null;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4 rounded-[18px] border border-flash/40 bg-body-2 p-5">
      <div>
        <p className="text-xs font-bold tracking-[0.18em] text-flash uppercase">Save the date</p>
        <p className="mt-1 text-lg text-cream">
          {locked ? "Your camera unlocks" : "The event starts"} <span className="font-semibold">{whenText}</span>.
        </p>
      </div>
      <p className="display numeric text-[clamp(34px,10vw,48px)] whitespace-nowrap leading-none text-cream">
        <Countdown to={startsAt} onDone={() => router.refresh()} />
      </p>
      <div className="flex flex-wrap gap-2">
        {/* A file download, so a plain link. */}
        <a href={`/e/${code}/calendar.ics`} className="h-11 rounded-full bg-cream px-5 leading-11 font-bold text-body">
          Add to calendar
        </a>
        {googleUrl && (
          <a href={googleUrl} target="_blank" rel="noopener" className="h-11 rounded-full bg-cream/12 px-5 leading-11 font-semibold text-cream">
            Google Calendar
          </a>
        )}
      </div>
      <p className="text-sm text-cream-dim">
        {locked
          ? "Come back to this link when it starts. Your shots will be waiting."
          : "You can join now, but save your shots for the night."}
      </p>
    </div>
  );
}
