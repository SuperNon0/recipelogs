import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppSidebar, AppTabBar, AppTopBar, type NavCounts } from "@/components/AppNav";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { ZoomReset } from "@/components/ZoomReset";
import { getSiteUrl } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";
import { APPLE_TOUCH_ICON } from "@/lib/apple-touch-icon";
import { headers } from "next/headers";
import Script from "next/script";
import { getViewer, viewerCan, viewerPermissions } from "@/lib/auth/viewer";
import { PATH_HEADER } from "@/lib/auth/path";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import { PermissionsProvider } from "@/components/auth/Permissions";
import { AccessGate } from "@/components/auth/AccessGate";
import { ViewAsBanner } from "@/components/auth/AccessButtons";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demo";
import { hiddenCookbookIds, visibleRecipeWhere } from "@/lib/auth/visibility";

// Le menu latéral affiche des compteurs lus en base : jamais de page figée au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RecipeLog",
  description: "Gestion de recettes de pâtisserie",
  appleWebApp: { capable: true, title: "RecipeLog", statusBarStyle: "black-translucent" },
  // Icône de l'écran d'accueil de l'iPhone, intégrée à la page (voir apple-touch-icon.ts).
  icons: { apple: [{ url: APPLE_TOUCH_ICON, sizes: "180x180", type: "image/png" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Couleur de la barre du téléphone : posée par encre.js d'après le thème affiché.
};

/* Design « encre » : avant l'affichage, relit l'accent et le thème gardés sur
   cet appareil (rien ne clignote). Ambre par défaut, thème automatique. */
const APPARENCE_AVANT_AFFICHAGE = `try {
  var p = JSON.parse(localStorage.getItem("encre-apparence") || "{}"), h = document.documentElement;
  if (p.accent) h.dataset.accent = p.accent;
  if (p.theme === "sombre") h.dataset.theme = "dark";
  else if (p.theme === "clair") h.dataset.theme = "light";
  else { h.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"; h.dataset.encreAuto = ""; }
} catch (e) {}`;

/** <html> du design « encre » : accent ambre par défaut, pas d'historique pour
 *  les feuilles (Next.js a le sien), icônes lues dans /encre/icones.svg. */
function EncreHtml({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      data-accent="ambre"
      data-accent-defaut="ambre"
      data-encre-sans-retour=""
      data-encre-sprite="/encre/icones.svg"
      suppressHydrationWarning
    >
      {children}
    </html>
  );
}

async function loadNavCounts(): Promise<NavCounts> {
  // Rôle limité à certaines catégories : les compteurs ne comptent que ses recettes.
  const vis = await visibleRecipeWhere();
  const [recipes, favorites, cookbooks, hiddenCookbooks, lists, production, noFolder, folders] = await Promise.all([
    // Les variantes sont rangées sous leur recette : comptées avec elle, pas à part.
    prisma.recipe.count({ where: { variantTargets: { none: {} }, ...vis } }),
    prisma.recipe.count({ where: { favorite: true, ...vis } }),
    prisma.cookbook.count(),
    hiddenCookbookIds(),
    prisma.shoppingList.count(),
    prisma.productionItem.count({ where: { recipe: vis } }),
    prisma.recipe.count({ where: { folderId: null, variantTargets: { none: {} }, ...vis } }),
    prisma.folder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { recipes: { where: { variantTargets: { none: {} }, ...vis } } } } },
    }),
  ]);
  return {
    recipes,
    favorites,
    cookbooks: cookbooks - hiddenCookbooks.size,
    lists,
    production,
    noFolder,
    folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes })),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = (await headers()).get(PATH_HEADER) ?? "";
  const viewer = await getViewer();
  // Partage public : pas de compte demandé (le middleware le garde en lecture seule).
  const gated = !path.startsWith("/share") && !viewerCan(viewer, "read");

  // Polices servies par le site lui-même (src/encre/polices.css, public/polices/).
  const fonts = (
    <head>
      <script dangerouslySetInnerHTML={{ __html: APPARENCE_AVANT_AFFICHAGE }} />
      <meta name="color-scheme" content="dark light" />
      <link rel="preload" href="/polices/archivo-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
      <link rel="preload" href="/polices/dm-serif-display-latin.woff2" as="font" type="font/woff2" crossOrigin="" />
    </head>
  );
  const encreJs = <Script src="/encre/encre.js" strategy="afterInteractive" />;

  // Comptes activés et visiteur sans accès : page de demande, d'attente, de refus ou de blocage.
  if (gated) {
    return (
      <EncreHtml>
        {fonts}
        <body>
          <AccessGate viewer={viewer} />
          {encreJs}
        </body>
      </EncreHtml>
    );
  }

  const [siteUrl, counts] = await Promise.all([getSiteUrl(), loadNavCounts()]);
  const viewingAs = viewer.kind === "account" && viewer.realAccount ? viewer.account : null;
  const perms = viewerPermissions(viewer);
  // Permissions absentes : les boutons marqués data-needs="…" sont masqués (styles/auth.css).
  const missing = ALL_PERMISSIONS.filter((p) => !perms.includes(p));

  return (
    <EncreHtml>
      {fonts}
      <body data-no={missing.length ? missing.join(" ") : undefined}>
        {isDemo() && <DemoBanner />}
        {viewingAs && <ViewAsBanner email={viewingAs.email} role={viewingAs.role?.name ?? "sans rôle"} />}
        <PermissionsProvider permissions={perms}>
        <div className="app">
          <AppSidebar siteUrl={siteUrl} counts={counts} />
          <div className="main">
            <AppTopBar />
            <main className="app-main">
              <div className="app-content">{children}</div>
            </main>
          </div>
        </div>
        <AppTabBar />
        <CommandPalette />
        </PermissionsProvider>
        <ZoomReset />
        {encreJs}
      </body>
    </EncreHtml>
  );
}
