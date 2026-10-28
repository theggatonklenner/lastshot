import type { Metadata } from "next";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { cache } from "react";
import { admin } from "@/lib/supabase/admin";
import { SLUG_PATTERN } from "@/lib/plans";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { CameraArt } from "@/components/camera-art";
import { LinkButton } from "@/components/ui";

/**
 * lastshot.app/<slug>: a venue partner's page, or an event's custom link
 * (Custom link add-on), which goes straight to the guest page.
 */
const lookup = cache(async (slug: string) => {
  if (!SLUG_PATTERN.test(slug)) return null;
  const db = admin();
  const { data: event } = await db.from("events").select("code, addon_link").eq("custom_slug", slug).maybeSingle();
  if (event?.addon_link) return { kind: "event" as const, code: event.code };
  const { data: partner } = await db
    .from("partners")
    .select("id, name, blurb, discount_percent, active")
    .eq("slug", slug)
    .maybeSingle();
  if (!partner?.active) return null;
  const { data: code } = await db
    .from("discount_codes")
    .select("code")
    .eq("partner_id", partner.id)
    .eq("kind", "partner")
    .eq("active", true)
    .maybeSingle();
  return { kind: "partner" as const, partner, code: code?.code ?? null };
});

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const found = await lookup(slug.toLowerCase());
  if (found?.kind !== "partner") return { robots: { index: false } };
  return {
    title: `${found.partner.name} x Lastshot`,
    description: `A disposable camera for everyone at your event at ${found.partner.name}. ${found.partner.discount_percent}% off for ${found.partner.name} customers.`,
  };
}

export default async function ShortLinkPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  const lower = slug.toLowerCase();
  if (lower !== slug && SLUG_PATTERN.test(lower)) permanentRedirect(`/${lower}`);
  const found = await lookup(lower);
  if (!found) notFound();
  if (found.kind === "event") redirect(`/e/${found.code}`);

  const { partner, code } = found;
  const start = code ? `/go/${code}?next=/signup` : "/signup";
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-14 px-4 py-12 sm:px-6 sm:py-20">
        <section className="grid items-center gap-10 md:grid-cols-[1.2fr_1fr]">
          <div className="flex flex-col gap-5">
            <p className="text-[15px] font-semibold uppercase tracking-wide text-cobalt">{partner.name} x Lastshot</p>
            <h1 className="display text-[clamp(40px,7vw,72px)] leading-[0.95]">A disposable camera for every guest.</h1>
            <p className="max-w-xl text-lg text-graphite">
              {partner.blurb ||
                `Planning an event at ${partner.name}? Put a QR code on the tables and every guest gets a camera on their phone. The photos develop in one shared gallery.`}
            </p>
            {partner.discount_percent > 0 && (
              <p className="inline-flex self-start rounded-full bg-ok-soft px-4 py-1.5 font-semibold text-ok">
                {partner.discount_percent}% off for {partner.name} customers
                {code ? (
                  <>
                    {" "}
                    · code <span className="ml-1 font-mono">{code}</span>
                  </>
                ) : null}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <LinkButton href={start}>Start your event</LinkButton>
              <LinkButton href="/#pricing" variant="secondary">
                See pricing
              </LinkButton>
            </div>
            <p className="text-sm text-graphite">The discount is applied for you at checkout. Free for up to 10 guests.</p>
          </div>
          <div className="mx-auto w-full max-w-xs">
            <CameraArt />
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ["No app", "Guests scan the code and the camera opens in their browser."],
            ["Limited shots", "Each guest gets a set number of shots, so every one counts."],
            ["One gallery", "Everyone's photos develop together, at the end of the night or when you say."],
          ].map(([t, b]) => (
            <div key={t} className="rounded-panel border border-line bg-card p-5">
              <h2 className="text-lg font-bold">{t}</h2>
              <p className="text-graphite">{b}</p>
            </div>
          ))}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
