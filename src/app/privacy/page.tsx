import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Privacy" };

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "What we collect from guests",
    body: (
      <>
        <p>
          The photos you take, the name you enter (if any), and a random camera ID stored in your browser so your shot
          count survives a reload. Guests don&apos;t create accounts, and an email address is only needed if you ask us to send you the photos.
        </p>
        <p>
          Before a photo is stored we remove its hidden metadata, including GPS location and device details. We keep a
          one-way fingerprint of your network address for a short time to stop people creating endless cameras. It
          can&apos;t be turned back into your address.
        </p>
        <p>
          If you choose to leave an email address, we use it only to send you one email with a private link when the
          event&apos;s photos are ready. The event organiser can see the address. Every email has an unsubscribe link, and
          the address is deleted with the event.
        </p>
      </>
    ),
  },
  {
    title: "What we collect from organisers",
    body: <p>Your email address, password (stored hashed by our authentication provider), your name if you give it, and the events you create.</p>,
  },
  {
    title: "Who can see photos",
    body: (
      <p>
        The organiser can see every photo taken at their event. Other guests see photos only when the organiser opens
        the gallery, and only photos the organiser has allowed. Photos are kept in private storage and are shared
        through links that expire after an hour.
      </p>
    ),
  },
  {
    title: "How long we keep things",
    body: (
      <>
        <p>
          Photos, guest records and email addresses are deleted automatically 180 days after an event ends, unless the
          organiser chooses to keep them (they&apos;re emailed two weeks before). Organisers can delete photos or a whole
          event sooner, which removes everything for it straight away. Rate-limit records are deleted after a day.
        </p>
        <p>
          Our database provider may keep encrypted backups for a limited period (up to 7 days on most plans). Deleted
          data drops out of those backups as they expire. Photo files themselves are not kept in backups once deleted.
        </p>
      </>
    ),
  },
  {
    title: "Your choices",
    body: (
      <p>
        If you&apos;re in a photo and want it removed, use the Report button on the photo or ask the organiser of the event,
        who can delete any photo. Organisers can delete their account and all their events from Account settings. For
        anything else, email <a href="mailto:support@lastshot.app" className="font-semibold text-cobalt hover:underline">support@lastshot.app</a>.
      </p>
    ),
  },
  {
    title: "Taking photos of others",
    body: (
      <p>
        By joining an event you agree to only take photos that people are comfortable sharing with the group. Be
        especially careful with photos of children. Organisers can remove photos and turn off a camera that&apos;s being
        misused.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="display-md mb-3 text-4xl">Privacy notice</h1>
        <p className="mb-10 text-lg text-graphite">What Lastshot collects, who sees it, and how long we keep it.</p>
        <div className="flex flex-col gap-10">
          {sections.map((s) => (
            <section key={s.title} className="flex flex-col gap-3">
              <h2 className="text-xl font-bold">{s.title}</h2>
              <div className="flex flex-col gap-3 text-graphite">{s.body}</div>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
