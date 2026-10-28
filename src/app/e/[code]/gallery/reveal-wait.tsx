"use client";

import { useRouter } from "next/navigation";
import { Countdown } from "@/components/countdown";

/** Counts down to the reveal, then reloads the page to show the photos. */
export function RevealWait({ to }: { to: string }) {
  const router = useRouter();
  return (
    <p className="mt-4">
      Opens in{" "}
      <Countdown
        to={to}
        className="display numeric text-2xl text-cream"
        onDone={() => setTimeout(() => router.refresh(), 1500)}
      />
    </p>
  );
}
