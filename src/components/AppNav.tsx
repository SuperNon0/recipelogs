"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHANGELOG } from "@/lib/changelog";

const NAV = [
  { href: "/", label: "Recettes", icon: "📖", match: (p: string) => p === "/" || p.startsWith("/recipes") },
  { href: "/favorites", label: "Favoris", icon: "★", match: (p: string) => p.startsWith("/favorites") },
  { href: "/cookbooks", label: "Cahiers", icon: "📚", match: (p: string) => p.startsWith("/cookbooks") },
  { href: "/shopping", label: "Courses", icon: "🛒", match: (p: string) => p.startsWith("/shopping") },
  { href: "/settings", label: "Réglages", icon: "⚙", match: (p: string) => p.startsWith("/settings") },
];

const currentVersion = CHANGELOG[0]?.version ?? "v1";

export function AppNav({ siteUrl }: { siteUrl: string | null }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const logoHref = isHome && siteUrl ? siteUrl : "/";
  const logoTarget = isHome && siteUrl ? "_blank" : undefined;
  const logoRel = isHome && siteUrl ? "noopener noreferrer" : undefined;

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        className="max-w-5xl mx-auto flex items-center gap-3 px-4"
        style={{ height: 56 }}
      >
        {/* Logo */}
        <Link
          href={logoHref}
          target={logoTarget}
          rel={logoRel}
          className="flex items-center gap-2 shrink-0 mr-1"
          style={{ textDecoration: "none" }}
        >
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.25rem",
              lineHeight: 1,
            }}
          >
            <span style={{ color: "var(--accent)" }}>recipe</span>
            <span style={{ color: "var(--text)", fontStyle: "italic" }}>log</span>
          </span>
          <span
            style={{
              fontSize: "0.55rem",
              fontFamily: "var(--font-mono)",
              color: "var(--muted)",
              background: "rgba(255,255,255,0.04)",
              padding: "0.15rem 0.4rem",
              borderRadius: 4,
              letterSpacing: "0.04em",
              lineHeight: 1,
            }}
          >
            {currentVersion}
          </span>
        </Link>

        {/* Pill nav */}
        <div
          className="flex items-center gap-1 flex-1 overflow-x-auto fl-scroll-hidden"
          style={{
            background: "rgba(255,255,255,0.03)",
            borderRadius: 10,
            padding: "0.25rem",
          }}
        >
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="fl-nav-pill"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  padding: "0.45rem 0.85rem",
                  borderRadius: 8,
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-mono)",
                  fontWeight: active ? 600 : 400,
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  textDecoration: "none",
                  transition: "background 150ms ease, color 150ms ease",
                  background: active
                    ? "rgba(232, 197, 71, 0.12)"
                    : "transparent",
                  color: active ? "var(--accent)" : "var(--muted)",
                }}
              >
                <span style={{ fontSize: "0.82rem", lineHeight: 1 }}>{item.icon}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* What's new */}
        <Link
          href="/whats-new"
          style={{
            fontSize: "0.6rem",
            fontFamily: "var(--font-mono)",
            color: pathname === "/whats-new" ? "var(--accent)" : "var(--muted)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            padding: "0.35rem 0.5rem",
            borderRadius: 6,
            background: pathname === "/whats-new" ? "rgba(232,197,71,0.1)" : "transparent",
            transition: "color 150ms ease",
            letterSpacing: "0.03em",
          }}
          className="shrink-0 hidden md:block"
        >
          Nouveautés
        </Link>
      </div>
    </nav>
  );
}
