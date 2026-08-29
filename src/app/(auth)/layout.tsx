/**
 * Layout minimal pour les pages d'authentification :
 * pas de nav principale, logo centré, thème dark identique au reste du site.
 */
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-60px)] flex flex-col items-center justify-center px-4 py-12">
      <Link
        href="/login"
        className="font-serif text-4xl leading-none mb-10"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        <span style={{ color: "var(--accent)" }}>recipe</span>
        <span style={{ color: "var(--text)", fontStyle: "italic" }}>log</span>
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
