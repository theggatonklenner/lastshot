"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function EventTabs({ id, pendingReview }: { id: string; pendingReview: number }) {
  const path = usePathname();
  const base = `/dashboard/events/${id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}/photos`, label: "Photos", badge: pendingReview },
    { href: `${base}/guests`, label: "Guests" },
    { href: `${base}/share`, label: "Share" },
    { href: `${base}/analytics`, label: "Analytics" },
    { href: `${base}/settings`, label: "Settings" },
  ];
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Event sections">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.href === base ? path === base : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-[15px] font-semibold transition-colors",
                  active ? "border-cobalt text-ink" : "border-transparent text-graphite hover:text-ink",
                )}
              >
                {t.label}
                {!!t.badge && (
                  <span className="rounded-full bg-cobalt px-1.5 text-xs leading-5 text-white">{t.badge}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
