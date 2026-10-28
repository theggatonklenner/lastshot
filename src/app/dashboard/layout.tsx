import Link from "next/link";
import { requireOrganiser } from "@/lib/server/organiser";
import { signOut } from "@/app/auth/actions";
import { LinkButton, Logo } from "@/components/ui";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireOrganiser();
  const { data: profile } = await supabase.from("profiles").select("display_name, email, is_admin").eq("id", user.id).maybeSingle();
  const name = profile?.display_name || profile?.email || user.email;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" aria-label="Your events">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {profile?.is_admin && (
              <LinkButton href="/admin" size="sm" variant="ghost" className="hidden sm:inline-flex">
                Admin
              </LinkButton>
            )}
            <LinkButton href="/dashboard/new" size="sm">
              New event
            </LinkButton>
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center rounded-[10px] px-0 text-[15px] sm:px-3 font-semibold hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
                <span
                  aria-label={name ?? "Account"}
                  className="flex size-9 items-center justify-center rounded-full bg-cobalt text-sm font-bold text-white sm:hidden"
                >
                  {(name ?? "?").trim().charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-[20ch] truncate sm:inline">{name}</span>
              </summary>
              <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-control border border-line bg-card p-2 shadow-lg">
                <p className="truncate px-2 py-1.5 text-sm text-graphite">{profile?.email}</p>
                <Link href="/dashboard/account" className="block rounded-lg px-2 py-2 font-semibold hover:bg-ink/5">
                  Account settings
                </Link>
                <Link href="/dashboard/billing" className="block rounded-lg px-2 py-2 font-semibold hover:bg-ink/5">
                  Billing
                </Link>
                {profile?.is_admin && (
                  <Link href="/admin" className="block rounded-lg px-2 py-2 font-semibold hover:bg-ink/5 sm:hidden">
                    Admin
                  </Link>
                )}
                <form action={signOut}>
                  <button className="w-full rounded-lg px-2 py-2 text-left font-semibold hover:bg-ink/5">Sign out</button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
