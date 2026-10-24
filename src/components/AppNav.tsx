"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import {
  BookOpen,
  ChefHat,
  Library,
  Palette,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  Star,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { fullVersion } from "@/lib/version";
import { openSearch } from "@/components/ui/CommandPalette";

export type NavCounts = {
  recipes: number;
  favorites: number;
  cookbooks: number;
  lists: number;
  noFolder: number;
  folders: { id: number; name: string; color: string; count: number }[];
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (p: string, folder: string | null) => boolean;
  count?: (c: NavCounts) => number;
};

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Recettes",
    icon: BookOpen,
    match: (p, f) => (p === "/" && !f) || p.startsWith("/recipes"),
    count: (c) => c.recipes,
  },
  { href: "/favorites", label: "Favoris", icon: Star, match: (p) => p.startsWith("/favorites"), count: (c) => c.favorites },
  { href: "/cookbooks", label: "Cahiers", icon: Library, match: (p) => p.startsWith("/cookbooks"), count: (c) => c.cookbooks },
  { href: "/shopping", label: "Courses", icon: ShoppingBasket, match: (p) => p.startsWith("/shopping"), count: (c) => c.lists },
  { href: "/settings/ingredients", label: "Ingrédients", icon: Wheat, match: (p) => p.startsWith("/settings/ingredients") },
];

const TABS: NavItem[] = [
  NAV[0],
  NAV[1],
  NAV[2],
  NAV[3],
  {
    href: "/settings",
    label: "Réglages",
    icon: Settings2,
    match: (p) => p.startsWith("/settings"),
  },
];

const currentVersion = fullVersion();

/** Menu latéral (ordinateur, ≥ 900 px). */
export function AppSidebar(props: { siteUrl: string | null; counts: NavCounts }) {
  return (
    <Suspense fallback={<SidebarInner {...props} folder={null} pathname="" />}>
      <SidebarWithParams {...props} />
    </Suspense>
  );
}

function SidebarWithParams(props: { siteUrl: string | null; counts: NavCounts }) {
  const pathname = usePathname();
  const folder = useSearchParams().get("folder");
  return <SidebarInner {...props} folder={folder} pathname={pathname} />;
}

function SidebarInner({
  siteUrl,
  counts,
  folder,
  pathname,
}: {
  siteUrl: string | null;
  counts: NavCounts;
  folder: string | null;
  pathname: string;
}) {
  const isHome = pathname === "/";
  const external = isHome && siteUrl;
  return (
    <aside className="app-side fl-scroll" aria-label="Navigation">
      <Link
        href={external ? siteUrl : "/"}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="side-brand"
      >
        <span className="mk">
          <ChefHat size={16} />
        </span>
        RecipeLog
        <span className="ver">{currentVersion}</span>
      </Link>

      <button type="button" className="side-search" onClick={openSearch}>
        <Search size={14} />
        <span style={{ flex: 1 }}>Rechercher…</span>
        <span className="fl-kbd">Ctrl K</span>
      </button>

      {NAV.map((item) => (
        <SideLink key={item.href} item={item} counts={counts} active={item.match(pathname, folder)} />
      ))}

      <div className="side-label">
        Dossiers
        <Link href="/settings/folders" aria-label="Gérer les dossiers" title="Gérer les dossiers" style={{ display: "grid", color: "var(--muted)" }}>
          <Plus size={14} />
        </Link>
      </div>
      {counts.folders.map((f) => {
        const active = isHome && folder === String(f.id);
        return (
          <Link key={f.id} href={`/?folder=${f.id}`} className="side-item" aria-current={active ? "page" : undefined}>
            <span className="dot" style={{ background: f.color }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <span className="c">{f.count}</span>
          </Link>
        );
      })}
      {counts.noFolder > 0 && (
        <Link
          href="/?folder=none"
          className="side-item"
          aria-current={isHome && folder === "none" ? "page" : undefined}
        >
          <span className="dot" style={{ background: "var(--border2)" }} />
          Sans dossier
          <span className="c">{counts.noFolder}</span>
        </Link>
      )}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <SideLink
          item={{ href: "/settings/themes", label: "Thèmes PDF", icon: Palette, match: (p) => p.startsWith("/settings/themes") }}
          counts={counts}
          active={pathname.startsWith("/settings/themes")}
        />
        <SideLink
          item={TABS[4]}
          counts={counts}
          active={pathname.startsWith("/settings") && !pathname.startsWith("/settings/themes") && !pathname.startsWith("/settings/ingredients")}
        />
      </div>
    </aside>
  );
}

function SideLink({ item, counts, active }: { item: NavItem; counts: NavCounts; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="side-item" aria-current={active ? "page" : undefined}>
      <Icon size={17} />
      {item.label}
      {item.count && <span className="c">{item.count(counts)}</span>}
    </Link>
  );
}

/** Barre du haut (téléphone et tablette étroite). */
export function AppTopBar() {
  return (
    <header className="app-top">
      <Link href="/" className="side-brand" style={{ padding: 0, fontSize: 18 }}>
        <span className="mk">
          <ChefHat size={16} />
        </span>
        RecipeLog
      </Link>
      <span style={{ flex: 1 }} />
      <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" onClick={openSearch} aria-label="Rechercher">
        <Search size={20} />
      </button>
      <Link href="/settings/themes" className="fl-btn fl-btn-ghost fl-btn-icon" aria-label="Thèmes PDF">
        <Palette size={20} />
      </Link>
    </header>
  );
}

/** Barre d'onglets du bas (téléphone et tablette étroite). */
export function AppTabBar() {
  return (
    <Suspense fallback={null}>
      <TabBarInner />
    </Suspense>
  );
}

function TabBarInner() {
  const pathname = usePathname();
  const folder = useSearchParams().get("folder");
  return (
    <nav className="app-tabbar" aria-label="Navigation principale">
      {TABS.map((t) => {
        const Icon = t.icon;
        const active = t.match(pathname, folder) || (t.href === "/" && pathname === "/");
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}>
            <Icon size={21} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
