import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadGuestContext } from "@/lib/server/guest-page";
import { formatDateTime } from "@/lib/format";
import { RETAKES_PER_ROLL, RETAKE_WINDOW_MINUTES, bonusPending, isPast, shotLimit } from "@/lib/rules";
import { admin } from "@/lib/supabase/admin";
import { RetakeButton } from "@/components/guest/retake-button";
import { Countdown } from "@/components/countdown";
import { GuestMessage, guestButton } from "@/components/guest/guest-shell";
import { EmailCapture } from "@/components/guest/email-capture";
import { SmsCapture } from "@/components/guest/sms-capture";
import { PushOptIn } from "@/components/guest/push-opt-in";
import { AddToHomeHint } from "@/components/guest/add-to-home";

export const metadata: Metadata = { title: "Roll finished", robots: { index: false } };

export default async function DonePage({ params }: PageProps<"/e/[code]/done">) {
  const { code } = await params;
  const ctx = await loadGuestContext(code);
  if (!ctx) notFound();
  const { event, guest, access, galleryHref, accepting } = ctx;
  if (!guest) redirect(`/e/${code}`);

  // Bonus shots unlocked since the guest finished: send them back to the camera.
  if (accepting && !guest.blocked && guest.photos_submitted < shotLimit(event)) {
    return (
      <GuestMessage brand={ctx.brand}
        title="Bonus shots unlocked"
        action={
          <Link href={`/e/${code}/camera`} className={guestButton}>
            Open the camera
          </Link>
        }
      >
        <p>
          The organiser gave everyone {event.bonus_shots} more {event.bonus_shots === 1 ? "shot" : "shots"}. Make them count.
        </p>
      </GuestMessage>
    );
  }
  const bonusLater = accepting && bonusPending(event) && event.bonus_at;
  // Offer a notification while the photos are still to come (it includes the home screen steps on iPhone).
  const wantsPush =
    event.gallery_visibility !== "private" && !(access.allowed && (event.status === "ended" || event.reveal_mode !== "live"));
  const mysteryLater = accepting && event.mystery_at && !isPast(event.mystery_at) ? event.mystery_at : null;
  // Offer the retake if it's still possible (last photo within the window).
  let canRetake = false;
  if (accepting && !guest.blocked && guest.retakes_used < RETAKES_PER_ROLL) {
    const { data: last } = await admin()
      .from("photos")
      .select("uploaded_at")
      .eq("guest_id", guest.id)
      .eq("upload_status", "complete")
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    canRetake =
      !!last?.uploaded_at && !isPast(new Date(new Date(last.uploaded_at).getTime() + RETAKE_WINDOW_MINUTES * 60_000).toISOString());
  }

  const shots = guest.photos_submitted;
  let galleryLine: React.ReactNode;
  if (access.allowed) {
    galleryLine = "The gallery is open. See what everyone else caught.";
  } else if (access.reason === "not_revealed" && access.revealAt) {
    galleryLine = (
      <>
        Photos develop {formatDateTime(access.revealAt, event.timezone)}. That&apos;s in{" "}
        <Countdown to={access.revealAt} className="numeric font-semibold text-cream" />. Keep this link to come back.
      </>
    );
  } else if (access.reason === "not_revealed") {
    galleryLine = "The organiser will open the gallery soon. Keep this link to come back.";
  } else {
    galleryLine = "The organiser is collecting these photos privately.";
  }

  return (
    <GuestMessage brand={ctx.brand}
      title="That's the roll"
      action={
        galleryHref && access.allowed ? (
          <Link href={galleryHref} className={guestButton}>
            See the gallery
          </Link>
        ) : galleryHref ? (
          <Link href={galleryHref} className="font-semibold text-flash underline underline-offset-4">
            Gallery page
          </Link>
        ) : null
      }
    >
      <p>
        All {shots === 1 ? "1 photo is" : `${shots} photos are`} saved to {event.title}. Nice work.
      </p>
      {bonusLater && (
        <p className="mt-3 rounded-[14px] bg-body-2 p-3 font-semibold text-flash">
          {event.bonus_shots} bonus {event.bonus_shots === 1 ? "shot unlocks" : "shots unlock"} in{" "}
          <Countdown to={bonusLater} className="numeric" />. Come back to this page then.
        </p>
      )}
      {mysteryLater && (
        <p className="mt-3 rounded-[14px] bg-body-2 p-3 font-semibold text-flash">
          A mystery shot unlocks in <Countdown to={mysteryLater} className="numeric" />. Come back to this page then for
          your surprise challenge.
        </p>
      )}
      <p className="mt-3">{galleryLine}</p>
      {canRetake && <RetakeButton code={code} />}
      {wantsPush ? (
        <div className="mt-6">
          <PushOptIn code={code} />
        </div>
      ) : (
        galleryHref && (
          <div className="mt-6">
            <AddToHomeHint />
          </div>
        )
      )}
      {event.addon_sms && event.gallery_visibility !== "private" && (
        <div className="mt-6">
          <SmsCapture code={code} alreadyOpen={access.allowed && (event.status === "ended" || event.reveal_mode !== "live")} />
        </div>
      )}
      {event.email_capture_enabled && event.gallery_visibility !== "private" && (
        <div className="mt-6">
          <EmailCapture code={code} alreadyOpen={access.allowed && (event.status === "ended" || event.reveal_mode !== "live")} />
        </div>
      )}
    </GuestMessage>
  );
}
