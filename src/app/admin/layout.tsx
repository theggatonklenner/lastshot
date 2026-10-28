import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/server/admin-auth";
import { Logo } from "@/components/ui";
import { AdminTabs } from "./tabs";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Lastshot admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-body text-cream">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-3" aria-label="Admin home">
              <Logo tone="cream" />
              <span className="rounded-full bg-flash px-2.5 py-0.5 text-sm font-bold text-body">Admin</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full bg-cream px-4 text-[15px] font-bold text-body transition-[filter] hover:brightness-95"
            >
              <span aria-hidden>&larr;</span>
              <span className="hidden sm:inline">Back to dashboard</span>
              <span className="sm:hidden">Dashboard</span>
            </Link>
          </div>
          <AdminTabs />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
