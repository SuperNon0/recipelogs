import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { AppNav } from "@/components/AppNav";

export const metadata: Metadata = {
  title: "RecipeLog",
  description: "Gestion de recettes de pâtisserie",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0f11",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
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
        <main className="max-w-5xl mx-auto px-4 py-6 pb-28">{children}</main>
      </body>
    </html>
  );
}
