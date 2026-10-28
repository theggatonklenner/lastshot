"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/organisers", label: "Organisers" },
  { href: "/admin/emails", label: "Emails" },
  { href: "/admin/sms", label: "SMS" },
  { href: "/admin/partners", label: "Partners and codes" },
  { href: "/admin/errors", label: "Errors" },
];

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Admin sections">
      <ul className="flex min-w-max gap-1">
        {TABS.map((t) => {
          const active = t.href === "/admin" ? path === "/admin" : path.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex border-b-2 px-3 py-3 text-[15px] font-semibold transition-colors",
                  active ? "border-flash text-cream" : "border-transparent text-cream-dim hover:text-cream",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
