import { CameraArt } from "@/components/camera-art";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { LinkButton } from "@/components/ui";

const steps = [
  {
    title: "Set up the roll",
    body: "Name the event, choose how many shots each guest gets, and decide when the photos develop.",
  },
  {
    title: "Put the code on the tables",
    body: "Print the sign or share the link. Guests scan it and the camera opens in their browser.",
  },
  {
    title: "Guests shoot",
    body: "No app, no account. They see a counter, not a feed, so they look up and take the shot that matters.",
  },
  {
    title: "Everything develops in one place",
    body: "Photos land in a shared gallery as they're taken, at a set time, or when you say so.",
  },
];

const controls = [
  ["Shots per guest", "From 1 to 100. The limit is enforced on our servers, so refreshing the page doesn't reload the roll."],
  ["Reveal timing", "Live, at a scheduled time, or when you press the button. Hidden photos stay hidden, even from direct links."],
  ["Moderation", "Approve, reject, flag or delete any photo. Block a camera that's being misused."],
  ["Downloads", "Let guests save photos, or keep downloads to yourself. Every original is available as a ZIP."],
];

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {sp.account === "deleted" && (
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p role="status" className="rounded-control bg-ok-soft px-4 py-3 text-ok">
            Your account and its events have been deleted.
          </p>
        </div>
      )}
      <main className="flex-1">
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-6 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14">
          <div className="flex flex-col items-start gap-7">
            <h1 className="display text-[clamp(44px,8.5vw,92px)]">
              Twelve shots each. One roll for everyone.
            </h1>
            <p className="max-w-[34ch] text-xl text-graphite">
              Lastshot is a disposable camera for your event. Guests scan a code, shoot on their own phone, and every
              photo develops into one shared gallery.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/signup" size="lg">
                Create an event
              </LinkButton>
              <LinkButton href="/try" size="lg" variant="secondary">
                Try the camera
              </LinkButton>
            </div>
            <p className="text-sm text-graphite">Free to set up. Guests don&apos;t need an account or an app.</p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <CameraArt count={12} className="rotate-[-4deg]" />
          </div>
        </section>

        <section className="bg-body text-cream">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <h2 className="display-md max-w-[22ch] text-[clamp(30px,4.5vw,48px)]">How a roll works</h2>
            <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.title} className="flex flex-col gap-3">
                  <span className="display flex size-11 items-center justify-center rounded-full border-2 border-cream/30 text-lg text-flash">
                    {i + 1}
                  </span>
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  <p className="text-cream-dim">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
            <div className="flex flex-col gap-4">
              <h2 className="display-md text-[clamp(30px,4.5vw,48px)]">You run the darkroom</h2>
              <p className="max-w-[36ch] text-lg text-graphite">
                The organiser decides how the event plays out. Change settings at any time without touching photos
                already taken.
              </p>
            </div>
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {controls.map(([term, desc]) => (
                <div key={term} className="border-t-2 border-ink pt-4">
                  <dt className="text-lg font-bold">{term}</dt>
                  <dd className="mt-1.5 text-graphite">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-shell bg-cobalt px-7 py-10 text-white sm:flex-row sm:items-center sm:px-10">
            <h2 className="display-md max-w-[20ch] text-[clamp(26px,3.6vw,40px)]">Load a roll for your next event</h2>
            <LinkButton href="/signup" size="lg" variant="flash">
              Create an event
            </LinkButton>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
