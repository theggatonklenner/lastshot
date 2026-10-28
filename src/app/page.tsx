import QRCode from "qrcode";
import { CameraArt } from "@/components/camera-art";
import { PRODUCTION_URL } from "@/lib/env";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { LinkButton, cx } from "@/components/ui";
import { PLANS, formatPrice } from "@/lib/plans";

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
  ["Bonus shots", "Unlock extra shots for everyone at a set time, like +5 at 10pm, so the photos keep coming."],
  ["TV slideshow", "Put the roll on a TV or projector. New photos appear as they're taken, with the QR code in the corner."],
];

// Illustrated "photos" for the example gallery: warm film-like gradients.
const FRAMES = [
  ["#f4a259", "#bc4b51"],
  ["#5b8e7d", "#2f3e46"],
  ["#f6d365", "#fda085"],
  ["#2546d8", "#0b1340"],
  ["#e76f51", "#264653"],
  ["#c9ada7", "#4a4e69"],
  ["#ffd23f", "#ee6c4d"],
  ["#84a59d", "#f28482"],
  ["#3d5a80", "#98c1d9"],
];

function Phone({ children, label, className }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <figure className={cx("flex flex-col items-center gap-4", className)}>
      <div className="w-full max-w-[230px] rounded-[34px] border-[6px] border-ink bg-body p-2.5 shadow-[0_24px_60px_-20px_rgb(22_23_26/0.45)]">
        <div className="relative aspect-[9/17] overflow-hidden rounded-[24px] bg-body text-cream">{children}</div>
      </div>
      <figcaption className="text-center font-semibold">{label}</figcaption>
    </figure>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const demoQr = await QRCode.toString(`${PRODUCTION_URL}/try`, { type: "svg", margin: 0, color: { dark: "#16171a", light: "#ffffff" } });
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
            <p className="text-sm text-graphite">
              Free for up to 10 guests. Guests don&apos;t need an account or an app.
            </p>
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

        <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-6 px-4 py-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex flex-col gap-3">
              <h2 className="display-md text-[clamp(30px,4.5vw,48px)]">What your guests see</h2>
              <p className="max-w-[44ch] text-lg text-graphite">
                Three taps from the table to the shared roll. Try it yourself: the demo camera works on any phone.
              </p>
            </div>
            <LinkButton href="/try" variant="secondary">
              Try the demo camera
            </LinkButton>
          </div>
          <div className="mt-12 grid gap-10 sm:grid-cols-3">
            <Phone label="1. Scan the code on the table">
              <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center">
                <div
                  className="size-28 rounded-xl bg-white p-2 [&_svg]:size-full"
                  aria-hidden
                  dangerouslySetInnerHTML={{ __html: demoQr }}
                />
                <p className="display text-xl leading-tight">Sam&apos;s 30th</p>
                <span className="rounded-full bg-flash px-4 py-2 text-sm font-bold text-ink">Start camera</span>
              </div>
            </Phone>
            <Phone label="2. Shoot with a counter, not a feed">
              <div className="flex h-full flex-col p-3">
                <div className="relative flex-1 overflow-hidden rounded-[14px]" style={{ background: "linear-gradient(160deg,#f6d365,#fda085 55%,#bc4b51)" }}>
                  <span className="absolute right-2.5 bottom-2 font-mono text-[11px] font-bold text-stamp">&apos;26 11 14</span>
                </div>
                <div className="mt-3 flex items-center justify-between px-1">
                  <span className="display numeric rounded-md bg-black px-2 py-1 text-lg text-stamp">09</span>
                  <span className="size-12 rounded-full border-4 border-cream/80 bg-cream/10" aria-hidden />
                  <span className="w-9 text-right text-xs text-cream-dim">left</span>
                </div>
              </div>
            </Phone>
            <Phone label="3. Everyone's photos, one roll">
              <div className="flex h-full flex-col gap-2 p-3">
                <p className="display text-sm">Sam&apos;s 30th</p>
                <div className="grid grid-cols-3 gap-1">
                  {FRAMES.map(([a, b], i) => (
                    <span key={i} className="relative aspect-square rounded-[4px]" style={{ background: `linear-gradient(${120 + i * 25}deg, ${a}, ${b})` }}>
                      <span className="absolute right-1 bottom-0.5 font-mono text-[6px] text-stamp">&apos;26</span>
                    </span>
                  ))}
                </div>
                <span className="mt-auto rounded-full bg-cream py-2 text-center text-xs font-bold text-ink">Download all</span>
              </div>
            </Phone>
          </div>
          <p className="mt-6 text-center text-sm text-graphite">Illustrations. Your guests&apos; photos will look much better.</p>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
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

        <section id="pricing" className="scroll-mt-6 bg-paper-2">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="flex flex-col gap-3">
              <h2 className="display-md text-[clamp(30px,4.5vw,48px)]">Pay per event, not per month</h2>
              <p className="max-w-[52ch] text-lg text-graphite">
                Start free. If more guests are coming, upgrade the event once, even halfway through the night. Every
                plan has every feature; only the number of cameras changes.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {PLANS.map((p) => (
                <div
                  key={p.id}
                  className={cx(
                    "flex flex-col gap-4 rounded-panel border bg-card p-6",
                    p.id === "big" ? "border-cobalt ring-2 ring-cobalt" : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold">{p.name}</h3>
                    {p.id === "big" && (
                      <span className="rounded-full bg-cobalt px-2.5 py-0.5 text-xs font-bold text-white">Weddings</span>
                    )}
                  </div>
                  <p className="flex flex-col">
                    <span className="display text-5xl numeric">{p.price ? formatPrice(p.price) : "$0"}</span>
                    <span className="mt-1 text-sm text-graphite">{p.price ? "AUD, once per event" : "No card needed"}</span>
                  </p>
                  <p className="font-semibold">{p.guests === null ? "Unlimited guests" : `Up to ${p.guests} guests`}</p>
                  <p className="text-graphite">{p.blurb}</p>
                </div>
              ))}
            </div>
            <ul className="mt-8 grid gap-3 text-graphite sm:grid-cols-3">
              <li>
                <span className="font-semibold text-ink">Guests never pay.</span> They don&apos;t need an app or an
                account either.
              </li>
              <li>
                <span className="font-semibold text-ink">Upgrade mid-event.</span> You only pay the difference, and new
                guests can join straight away.
              </li>
              <li>
                <span className="font-semibold text-ink">No subscription.</span> Pay once with a card through Stripe.
                Photos are kept for 180 days.
              </li>
            </ul>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
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
