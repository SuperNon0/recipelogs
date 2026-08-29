"use client";

/**
 * Wrapper client autour du header + nav principaux.
 * Se cache automatiquement sur les pages d'authentification (/login,
 * /access/*, /share/*), qui ont leur propre présentation minimale.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppNav } from "./AppNav";

function isAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/access/") ||
    pathname.startsWith("/share/")
  );
}

export function AppChrome() {
  const pathname = usePathname();
  if (isAuthPath(pathname)) return null;
  return (
    <header className="sticky top-0 z-40 bg-[color:var(--surface)] border-b border-[color:var(--border)]">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 h-[60px]">
        <Link
          href="/"
          className="font-serif text-2xl leading-none"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          <span style={{ color: "var(--accent)" }}>recipe</span>
          <span style={{ color: "var(--text)", fontStyle: "italic" }}>
            log
          </span>
        </Link>
        <span className="fl-label">v0.1 · phase 1-2</span>
      </div>
      <AppNav />
    </header>
  );
}
