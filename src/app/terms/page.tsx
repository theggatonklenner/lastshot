import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/env";
import { SiteFooter, SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Terms of use" };

const UPDATED = "28 October 2026";

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "Using Lastshot",
    body: (
      <p>
        Lastshot lets an organiser run an event where guests take a limited number of photos on their own phones and
        share them in one gallery. By creating an account, joining an event or viewing a gallery, you agree to these
        terms. If you don&apos;t agree, don&apos;t use Lastshot.
      </p>
    ),
  },
  {
    title: "What you can't upload",
    body: (
      <>
        <p>Don&apos;t take or upload anything that:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>shows nudity, sexual content, or anyone in a private situation such as a bathroom or change room</li>
          <li>sexualises, exploits or endangers a child in any way</li>
          <li>harasses, bullies, threatens or humiliates someone</li>
          <li>shows someone who has asked not to be photographed</li>
          <li>is violent, hateful, illegal, or breaks someone else&apos;s rights</li>
          <li>contains personal details such as addresses, ID cards or documents</li>
        </ul>
        <p>We may remove content, block a camera, or suspend an event that breaks these rules, and report illegal content to the authorities.</p>
      </>
    ),
  },
  {
    title: "Photos of children and school events",
    body: (
      <>
        <p>If an event involves children, including school events, the organiser is responsible for:</p>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>following the school&apos;s or organisation&apos;s photography and consent policies</li>
          <li>making sure parents or carers have agreed to photos being taken and shared</li>
          <li>keeping the gallery to people who should see it (we recommend &quot;Guests who joined&quot; or &quot;Only me&quot;, not &quot;Anyone with the link&quot;)</li>
          <li>reviewing photos before they&apos;re shared, using &quot;Approve photos before they appear&quot;</li>
          <li>removing any photo a student, parent or carer asks to have removed</li>
        </ul>
        <p>Guests must not use Lastshot to photograph children they don&apos;t have permission to photograph.</p>
      </>
    ),
  },
  {
    title: "Organisers' responsibilities",
    body: (
      <>
        <p>
          The organiser decides who can join, what guests see and who can download photos. Organisers are responsible
          for their event, for the photos shared in it, and for responding to requests to remove photos. Keep your
          password safe, and only add co-organisers you trust.
        </p>
      </>
    ),
  },
  {
    title: "Who owns the photos",
    body: (
      <p>
        You keep the rights to photos you take. By uploading a photo you allow Lastshot to store it and show it to the
        organiser and, if the organiser allows, to other guests, and you allow the organiser and permitted guests to
        download it for personal use. We don&apos;t sell photos or use them to advertise Lastshot.
      </p>
    ),
  },
  {
    title: "Reporting and removing photos",
    body: (
      <p>
        Anyone viewing a gallery can report a photo. Reported photos are flagged for the organiser, and a photo reported
        several times is hidden until the organiser reviews it. If you&apos;re in a photo and want it removed, ask the
        organiser or email us at <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cobalt hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
  {
    title: "How long photos are kept",
    body: (
      <p>
        Photos are deleted automatically 180 days after an event ends, or 2 years if the organiser adds longer storage. The
        organiser is emailed two weeks before. Organisers can delete photos or a whole event at any time. See the{" "}
        <Link href="/privacy" className="font-semibold text-cobalt hover:underline">privacy notice</Link> for details.
      </p>
    ),
  },
  {
    title: "No guarantees",
    body: (
      <p>
        We work hard to keep Lastshot running and your photos safe, but we provide it as it is, without guarantees.
        Download anything you want to keep. To the extent the law allows, we aren&apos;t liable for lost photos, for
        what other people upload, or for losses from using Lastshot. Nothing in these terms limits rights you have under
        the Australian Consumer Law.
      </p>
    ),
  },
  {
    title: "Changes and contact",
    body: (
      <p>
        We may update these terms and will post the new version here. Questions or concerns:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-cobalt hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="display-md mb-3 text-4xl">Terms of use</h1>
        <p className="mb-10 text-lg text-graphite">Last updated {UPDATED}.</p>
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
