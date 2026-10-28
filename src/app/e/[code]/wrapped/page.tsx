import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { loadWrapped } from "@/lib/server/wrapped";
import { GuestMessage, GuestShell, guestSecondary } from "@/components/guest/guest-shell";
import { WrappedShare } from "./wrapped-share";

export const metadata: Metadata = { title: "Event Wrapped", robots: { index: false } };

function time(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** The night in numbers, once the gallery is open to this viewer. */
export default async function WrappedPage({ params }: PageProps<"/e/[code]/wrapped">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, access } = ctx;
  if (!access.allowed) {
    return (
      <GuestMessage brand={ctx.brand} title="Not wrapped yet">
        The recap of {event.title} appears once the photos are developed.
      </GuestMessage>
    );
  }
  const w = await loadWrapped(event);
  if (!w.photos) {
    return (
      <GuestMessage brand={ctx.brand} title="Nothing to wrap yet">
        Once photos are taken at {event.title}, the night&apos;s numbers appear here.
      </GuestMessage>
    );
  }
  const tz = event.timezone || "Australia/Sydney";
  const busiest = w.busiestStart ? `${time(w.busiestStart, tz)}, ${w.busiestCount} photos in 15 minutes` : null;
  const busiestShort = w.busiestStart ? time(w.busiestStart, tz) : null;
  const top = w.topName ? `${w.topName}, ${w.topCount} shots` : w.topCount > 1 ? `One guest took ${w.topCount}` : null;
  const span =
    w.firstAt && w.lastAt ? `${time(w.firstAt, tz)} to ${time(w.lastAt, tz)}` : null;

  const facts: [string, string][] = [
    ["Busiest moment", busiest ?? ""],
    ["Most shots", top ?? ""],
    ["First to last photo", span ?? ""],
    ["Guests who joined", String(w.guests)],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <GuestShell brand={ctx.brand}>
      <div className="flex flex-col gap-8 pt-10">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold tracking-[0.2em] text-flash uppercase">The night, wrapped</p>
          <h1 className="display text-[clamp(34px,9vw,52px)] break-words">{event.title}</h1>
        </div>

        {w.pictures.length > 0 && (
          <div className="relative mx-auto flex h-56 w-full max-w-sm items-center justify-center">
            {w.pictures.slice(0, 3).map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt=""
                className="absolute h-48 w-36 border-[6px] border-b-[18px] border-[#fbfaf7] object-cover shadow-xl"
                style={{ transform: `translateX(${(i - 1) * 88}px) rotate(${[-8, 3, 10][i]}deg)`, zIndex: i === 1 ? 2 : 1 }}
              />
            ))}
          </div>
        )}

        <div className="text-center">
          <p className="display numeric text-[clamp(72px,24vw,120px)] leading-none">{w.photos}</p>
          <p className="mt-2 text-lg text-cream-dim">
            {w.photos === 1 ? "photo" : "photos"} from {w.shooters} {w.shooters === 1 ? "guest" : "guests"}
          </p>
        </div>

        <dl className="grid gap-3">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-[16px] bg-body-2 px-4 py-3">
              <dt className="text-xs font-bold tracking-[0.15em] text-flash uppercase">{k}</dt>
              <dd className="mt-1 text-lg font-semibold">{v}</dd>
            </div>
          ))}
        </dl>

        <WrappedShare
          data={{ title: event.title, photos: w.photos, shooters: w.shooters, busiest: busiestShort, top, pictures: w.pictures }}
        />
        <Link href={`/e/${code}/gallery`} className={guestSecondary}>
          See every photo
        </Link>
      </div>
    </GuestShell>
  );
}
