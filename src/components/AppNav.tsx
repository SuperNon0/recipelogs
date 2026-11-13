"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  ChefHat,
  ClipboardList,
  History,
  MoreHorizontal,
  Library,
  Palette,
  Plus,
  Search,
  Settings2,
  ShoppingBasket,
  Star,
  Store,
  SunMoon,
  Wheat,
  X,
  type LucideIcon,
} from "lucide-react";
import { fullVersion } from "@/lib/version";
import { openSearch } from "@/components/ui/CommandPalette";
import { useEscape } from "@/components/ui/useMedia";
import { useOverlayOpen } from "@/components/ui/overlay";

export type NavCounts = {
  recipes: number;
  favorites: number;
  cookbooks: number;
  lists: number;
  production: number;
  noFolder: number;
  folders: { id: number; name: string; color: string; count: number }[];
};

type NavItem = {
  href: string;
  /** Permission nécessaire (lien masqué sinon, voir styles/auth.css). */
  needs?: string;
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
  { href: "/history", label: "Historique", icon: History, match: (p) => p.startsWith("/history") },
  { href: "/cookbooks", label: "Cahiers", icon: Library, match: (p) => p.startsWith("/cookbooks"), count: (c) => c.cookbooks },
  { href: "/shopping", label: "Courses", icon: ShoppingBasket, match: (p) => p.startsWith("/shopping"), count: (c) => c.lists },
  { href: "/production", label: "Production", icon: ClipboardList, match: (p) => p.startsWith("/production"), count: (c) => c.production },
  { href: "/settings/ingredients", needs: "organize.edit", label: "Ingrédients", icon: Wheat, match: (p) => p.startsWith("/settings/ingredients") },
  {
    href: "/fournisseurs",
    needs: "costs.view",
    label: "Prix fournisseurs",
    icon: Store,
    match: (p) => p.startsWith("/fournisseurs") || p.startsWith("/factures"),
  },
];

/** Onglets de la barre flottante (téléphone) : 4 onglets + « Plus » (encre : 5 cases au plus). */
const TABS: NavItem[] = [NAV[0], NAV[1], NAV[3], NAV[4]];

const SETTINGS: NavItem = {
  href: "/settings",
  label: "Réglages",
  icon: Settings2,
  match: (p) => p.startsWith("/settings") && !p.startsWith("/settings/themes") && !p.startsWith("/settings/ingredients"),
};

const THEMES: NavItem = {
  href: "/settings/themes",
  needs: "organize.edit",
  label: "Thèmes PDF",
  icon: Palette,
  match: (p) => p.startsWith("/settings/themes"),
};

/** Ce que montre « Plus » : de grandes tuiles (les pages sans onglet). */
const PLUS: NavItem[] = [NAV[5], NAV[2], NAV[6], NAV[7], THEMES, SETTINGS];

const currentVersion = fullVersion();

/** Nom du site façon « encre » : « Log » en italique, couleur d'accent. */
function Brand({ href, external, version }: { href: string; external?: boolean; version?: boolean }) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="brand"
    >
      <span className="mk" aria-hidden="true">
        <ChefHat size={17} />
      </span>
      <span className="wm">
        Recipe<b>Log</b>
      </span>
      {version && <span className="ver">{currentVersion}</span>}
    </Link>
  );
}

/** Menu de gauche (ordinateur, ≥ 900 px). */
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
  const external = Boolean(isHome && siteUrl);
  return (
    <aside className="side" aria-label="Navigation">
      <Brand href={external && siteUrl ? siteUrl : "/"} external={external} version />

      <button type="button" className="side-search" onClick={openSearch}>
        <Search size={16} />
        <span>Rechercher…</span>
        <span className="kbd">Ctrl K</span>
      </button>

      {NAV.map((item) => (
        <SideLink key={item.href} item={item} counts={counts} active={item.match(pathname, folder)} />
      ))}

      <div className="side-lbl">
        Dossiers
        <Link href="/settings/folders" data-needs="organize.edit" aria-label="Gérer les dossiers" title="Gérer les dossiers" className="side-lbl-a">
          <Plus size={14} />
        </Link>
      </div>
      <div className="side-listes">
        {counts.folders.map((f) => {
          const active = isHome && folder === String(f.id);
          return (
            <Link key={f.id} href={`/?folder=${f.id}`} className={active ? "side-it on" : "side-it"} aria-current={active ? "page" : undefined}>
              <span className="dot" style={{ background: f.color }} />
              <span className="nom">{f.name}</span>
              <span className="n">{f.count}</span>
            </Link>
          );
        })}
        {counts.noFolder > 0 && (
          <Link
            href="/?folder=none"
            className={isHome && folder === "none" ? "side-it on" : "side-it"}
            aria-current={isHome && folder === "none" ? "page" : undefined}
          >
            <span className="dot" />
            <span className="nom">Sans dossier</span>
            <span className="n">{counts.noFolder}</span>
          </Link>
        )}
      </div>

      <div className="side-foot">
        <SideLink item={THEMES} counts={counts} active={THEMES.match(pathname, folder)} />
        <SideLink item={SETTINGS} counts={counts} active={SETTINGS.match(pathname, folder)} />
      </div>
    </aside>
  );
}

function SideLink({ item, counts, active }: { item: NavItem; counts: NavCounts; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} data-needs={item.needs} className={active ? "side-it on" : "side-it"} aria-current={active ? "page" : undefined}>
      <Icon size={18} />
      <span className="nom">{item.label}</span>
      {item.count && <span className="n">{item.count(counts)}</span>}
    </Link>
  );
}

/** Barre du haut en verre (téléphone et tablette). */
export function AppTopBar() {
  return (
    <header className="top">
      <Brand href="/" />
      <span className="esp" />
      <button type="button" className="ib" onClick={openSearch} aria-label="Rechercher">
        <Search size={19} />
      </button>
      <Link href="/history" className="ib" aria-label="Historique">
        <History size={19} />
      </Link>
      <Link href="/settings/themes" data-needs="organize.edit" className="ib" aria-label="Thèmes PDF">
        <Palette size={19} />
      </Link>
    </header>
  );
}

/** Barre d'onglets flottante en verre flouté (téléphone et tablette). */
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
  const [plus, setPlus] = useState(false);
  const plusActive = !TABS.some((t) => t.match(pathname, folder) || (t.href === "/" && pathname === "/"));
  return (
    <>
      <nav className="tabbar" aria-label="Navigation principale">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = t.match(pathname, folder) || (t.href === "/" && pathname === "/");
          return (
            <Link key={t.href} href={t.href} className={active ? "tab on" : "tab"} aria-current={active ? "page" : undefined}>
              <span className="ti">
                <Icon size={22} />
              </span>
              {t.label}
            </Link>
          );
        })}
        <button
          type="button"
          className={plusActive ? "tab on" : "tab"}
          aria-haspopup="dialog"
          aria-expanded={plus}
          onClick={() => setPlus(true)}
        >
          <span className="ti">
            <MoreHorizontal size={22} />
          </span>
          Plus
        </button>
      </nav>
      {plus && <PlusSheet pathname={pathname} folder={folder} onClose={() => setPlus(false)} />}
    </>
  );
}

/**
 * Feuille « Plus » : les pages sans onglet, en grandes tuiles, puis la
 * recherche. Se ferme par la croix, Échap ou en touchant une page ;
 * jamais en touchant à côté (règle de RecipeLog pour toutes les fenêtres).
 */
function PlusSheet({ pathname, folder, onClose }: { pathname: string; folder: string | null; onClose: () => void }) {
  useEscape(true, onClose);
  useOverlayOpen(true);
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="voile" aria-hidden="true" />
      <div className="feuille" role="dialog" aria-modal="true" aria-label="Plus">
        <div className="grab" />
        <div className="feuille-t">
          <span className="tt">Plus</span>
          <span className="esp" />
          <button type="button" className="ib" onClick={onClose} aria-label="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="q-tuiles plus-t">
          {PLUS.map((item) => {
            const Icon = item.icon;
            const on = item.match(pathname, folder);
            return (
              <Link key={item.href} href={item.href} data-needs={item.needs} className={on ? "qt on" : "qt"} onClick={onClose}>
                <Icon size={22} />
                {item.label}
              </Link>
            );
          })}
        </div>
        <button
          type="button"
          className="q-ext"
          onClick={() => {
            onClose();
            openSearch();
          }}
        >
          <Search size={20} />
          Rechercher une recette, un ingrédient…
        </button>
        <Link href="/settings#apparence" className="q-ext" onClick={onClose}>
          <SunMoon size={20} />
          Apparence : thème et couleur
        </Link>
      </div>
    </>,
    document.body,
  );
}
