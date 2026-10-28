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
          count survives a reload. Guests don&apos;t create accounts and we don&apos;t ask for an email or phone number.
        </p>
        <p>
          Before a photo is stored we remove its hidden metadata, including GPS location and device details. We keep a
          one-way fingerprint of your network address for a short time to stop people creating endless cameras. It
          can&apos;t be turned back into your address.
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
          Photos and guest records stay until the organiser deletes them or deletes the event. Deleting an event removes
          every photo and guest record for it straight away. Rate-limit records are deleted after a day.
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
        If you&apos;re in a photo and want it removed, ask the organiser of the event. They can delete any photo. Organisers
        can delete their account data by deleting their events and contacting us to remove the account.
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
