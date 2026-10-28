import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";

/** Charcoal-and-cream frame for every guest screen, matching the camera. */
export function GuestShell({ children, cover, accent }: { children: ReactNode; cover?: string | null; accent?: string }) {
  return (
    <div className={`min-h-dvh bg-body text-cream ${cover === undefined ? "pt-[env(safe-area-inset-top)]" : ""}`}>
      {cover !== undefined && (
        <div className="grain relative h-[38dvh] max-h-[420px] min-h-[220px] w-full overflow-hidden" style={{ background: accent ?? "#2546d8" }}>
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgb(29_30_33/0.1)_40%,var(--color-body))]" />
        </div>
      )}
      <main className="mx-auto w-full max-w-lg px-5 pb-[max(32px,env(safe-area-inset-bottom))]">{children}</main>
      <footer className="mx-auto flex w-full max-w-lg items-center justify-between px-5 py-8 text-sm text-cream-dim">
        <Link href="/" aria-label="Lastshot home">
          <Logo tone="cream" className="scale-90 origin-left" />
        </Link>
        <Link href="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </footer>
    </div>
  );
}

export function GuestMessage({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <GuestShell>
      <div className="flex min-h-[70dvh] flex-col items-start justify-center gap-4 pt-16">
        <h1 className="display text-[clamp(36px,10vw,56px)]">{title}</h1>
        {children && <div className="text-lg text-cream-dim">{children}</div>}
        {action}
      </div>
    </GuestShell>
  );
}

export const guestButton =
  "inline-flex h-14 w-full items-center justify-center rounded-full bg-flash px-7 text-lg font-bold text-body transition-[filter] hover:brightness-95 disabled:opacity-50";
export const guestSecondary =
  "inline-flex h-12 w-full items-center justify-center rounded-full bg-cream/10 px-6 font-semibold text-cream hover:bg-cream/15";
