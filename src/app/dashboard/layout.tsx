import Link from "next/link";
import { requireOrganiser } from "@/lib/server/organiser";
import { signOut } from "@/app/auth/actions";
import { LinkButton, Logo } from "@/components/ui";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireOrganiser();
  const { data: profile } = await supabase.from("profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const name = profile?.display_name || profile?.email || user.email;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/dashboard" aria-label="Your events">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <LinkButton href="/dashboard/new" size="sm">
              New event
            </LinkButton>
            <details className="relative">
              <summary className="flex h-9 cursor-pointer list-none items-center rounded-[10px] px-3 text-[15px] font-semibold hover:bg-ink/5 [&::-webkit-details-marker]:hidden">
                <span className="max-w-[12ch] truncate sm:max-w-[20ch]">{name}</span>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-control border border-line bg-card p-2 shadow-lg">
                <p className="truncate px-2 py-1.5 text-sm text-graphite">{profile?.email}</p>
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
