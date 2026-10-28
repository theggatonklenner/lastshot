import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { LinkButton, Logo } from "@/components/ui";

export async function SiteHeader() {
  const { user } = await getUser();
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" aria-label="Lastshot home">
        <Logo />
      </Link>
      <nav className="flex items-center gap-2">
        <Link href="/#how-it-works" className="hidden px-2 text-[15px] font-semibold text-graphite hover:text-ink sm:inline">
          How it works
        </Link>
        <Link href="/#pricing" className="hidden px-2 text-[15px] font-semibold text-graphite hover:text-ink sm:inline">
          Pricing
        </Link>
        {user ? (
          <LinkButton href="/dashboard" size="sm">
            Your events
          </LinkButton>
        ) : (
          <>
            <LinkButton href="/login" variant="ghost" size="sm">
              Sign in
            </LinkButton>
            <LinkButton href="/signup" size="sm">
              Create an event
            </LinkButton>
          </>
        )}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-6xl border-t border-line px-4 py-8 text-sm text-graphite sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Logo className="scale-90 origin-left" />
        <div className="flex gap-5">
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/try" className="hover:text-ink">
            Try the camera
          </Link>
        </div>
      </div>
    </footer>
  );
}
