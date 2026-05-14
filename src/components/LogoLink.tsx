"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function LogoLink({ siteUrl }: { siteUrl: string | null }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const href = isHome && siteUrl ? siteUrl : "/";
  const target = isHome && siteUrl ? "_blank" : undefined;
  const rel = isHome && siteUrl ? "noopener noreferrer" : undefined;

  return (
    <Link
      href={href}
      target={target}
      rel={rel}
      className="font-serif text-2xl leading-none"
      style={{ fontFamily: "var(--font-serif)" }}
    >
      <span style={{ color: "var(--accent)" }}>recipe</span>
      <span style={{ color: "var(--text)", fontStyle: "italic" }}>log</span>
    </Link>
  );
}
