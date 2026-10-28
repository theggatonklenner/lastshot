import Link from "next/link";
import { GuestMessage, guestSecondary } from "@/components/guest/guest-shell";

export default function EventNotFound() {
  return (
    <GuestMessage
      title="No event here"
      action={
        <Link href="/" className={guestSecondary}>
          About Lastshot
        </Link>
      }
    >
      This link doesn&apos;t match an event. Check you scanned the whole QR code, or ask the organiser for the link.
    </GuestMessage>
  );
}
