"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Recettes", match: (p: string) => p === "/" || p.startsWith("/recipes") },
  { href: "/favorites", label: "Favoris", match: (p: string) => p.startsWith("/favorites") },
  { href: "/cookbooks", label: "Cahiers", match: (p: string) => p.startsWith("/cookbooks") },
  { href: "/shopping", label: "Courses", match: (p: string) => p.startsWith("/shopping") },
  { href: "/settings", label: "Paramètres", match: (p: string) => p.startsWith("/settings") },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="bg-[color:var(--surface)] border-b border-[color:var(--border)] overflow-x-auto fl-scroll-hidden">
      <div className="max-w-5xl mx-auto flex items-stretch px-2">
        {NAV.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="fl-nav-item"
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
