import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppSidebar, AppTabBar, AppTopBar, type NavCounts } from "@/components/AppNav";
import { CommandPalette } from "@/components/ui/CommandPalette";
import { getSiteUrl } from "@/app/actions/settings";
import { prisma } from "@/lib/prisma";

// Le menu latéral affiche des compteurs lus en base : jamais de page figée au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RecipeLog",
  description: "Gestion de recettes de pâtisserie",
  appleWebApp: { capable: true, title: "RecipeLog", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f17",
};

async function loadNavCounts(): Promise<NavCounts> {
  const [recipes, favorites, cookbooks, lists, noFolder, folders] = await Promise.all([
    // Les variantes sont rangées sous leur recette : comptées avec elle, pas à part.
    prisma.recipe.count({ where: { variantTargets: { none: {} } } }),
    prisma.recipe.count({ where: { favorite: true } }),
    prisma.cookbook.count(),
    prisma.shoppingList.count(),
    prisma.recipe.count({ where: { folderId: null, variantTargets: { none: {} } } }),
    prisma.folder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, _count: { select: { recipes: { where: { variantTargets: { none: {} } } } } } },
    }),
  ]);
  return {
    recipes,
    favorites,
    cookbooks,
    lists,
    noFolder,
    folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes })),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [siteUrl, counts] = await Promise.all([getSiteUrl(), loadNavCounts()]);

  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Fraunces:opsz,wght@9..144,400;9..144,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app">
          <AppSidebar siteUrl={siteUrl} counts={counts} />
          <div style={{ minWidth: 0 }}>
            <AppTopBar />
            <main className="app-main">
              <div className="app-content">{children}</div>
            </main>
          </div>
        </div>
        <AppTabBar />
        <CommandPalette />
      </body>
    </html>
  );
}
