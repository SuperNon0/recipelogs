import Link from "next/link";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeFilters } from "@/components/RecipeFilters";
import { FolderCard } from "@/components/FolderCard";
import { Fab } from "@/components/Fab";
import { EmptyState } from "@/components/EmptyState";
import {
  listAllCategories,
  listAllFolders,
  listAllTags,
  listRecipes,
} from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const categoryId =
    typeof sp.category === "string" ? Number(sp.category) : undefined;
  const folderParam = typeof sp.folder === "string" ? sp.folder : undefined;
  const view = typeof sp.view === "string" ? sp.view : undefined;

  // Mode d'affichage :
  //  - folderParam = "none" → dossier « Sans dossier »
  //  - folderParam = "42"   → ce dossier précis
  //  - view = "all"         → liste plate de toutes les recettes (groupée par dossier)
  //  - sinon (par défaut)   → vue explorateur (cards de dossiers)
  let folderFilter: number | "none" | undefined = undefined;
  if (folderParam === "none") folderFilter = "none";
  else if (folderParam && /^\d+$/.test(folderParam)) {
    folderFilter = Number(folderParam);
  }

  const isFilteringByFolder = folderFilter !== undefined;
  const isAllView = view === "all";
  const isExplorerView = !isFilteringByFolder && !isAllView;
  const hasSearchOrFilters = !!(q || tag || categoryId);

  // En vue explorateur on ne charge la liste de recettes que pour les
  // « sans dossier » à afficher en bas + tous les compteurs.
  const [tags, categories, folders, recipes] = await Promise.all([
    listAllTags(),
    listAllCategories(),
    listAllFolders(),
    isExplorerView
      ? listRecipes({ q, tag, categoryId, folderId: "none" })
      : listRecipes({ q, tag, categoryId, folderId: folderFilter }),
  ]);

  // Header dynamique
  const currentFolder =
    typeof folderFilter === "number"
      ? folders.find((f) => f.id === folderFilter) ?? null
      : null;
  const title =
    folderFilter === "none"
      ? "Sans dossier"
      : currentFolder
        ? currentFolder.name
        : isAllView
          ? "Toutes les recettes"
          : "Recettes";

  return (
    <>
      {/* Header + breadcrumb */}
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
        <div>
          {(isFilteringByFolder || isAllView) && (
            <Link
              href="/"
              className="fl-label hover:text-[color:var(--text)]"
              style={{ fontSize: "0.75rem" }}
            >
              ← Toutes les recettes
            </Link>
          )}
          <h1
            className="fl-title-serif mt-1"
            style={{ fontSize: "1.6rem" }}
          >
            {currentFolder ? `📁 ${currentFolder.name}` : title}
          </h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <span className="fl-label">
            {recipes.length} {recipes.length > 1 ? "recettes" : "recette"}
          </span>
          {isExplorerView ? (
            <Link
              href="/?view=all"
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.8rem" }}
              title="Voir toutes les recettes en liste plate"
            >
              📋 Tout afficher
            </Link>
          ) : isAllView ? (
            <Link
              href="/"
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.8rem" }}
            >
              📁 Vue par dossiers
            </Link>
          ) : null}
        </div>
      </div>

      <RecipeFilters allTags={tags} allCategories={categories} />

      {/* ── Vue 1 : explorateur (cards de dossiers + sans dossier) ── */}
      {isExplorerView && !hasSearchOrFilters && (
        <ExplorerView
          folders={folders}
          uncategorizedRecipes={recipes}
        />
      )}

      {/* ── Vue 2 : un dossier ouvert (ou « sans dossier ») ── */}
      {isFilteringByFolder && (
        <RecipeGrid
          recipes={recipes}
          emptyTitle="Dossier vide"
          emptyDescription={
            hasSearchOrFilters
              ? "Aucune recette ne correspond aux filtres dans ce dossier."
              : currentFolder
                ? `Aucune recette dans le dossier « ${currentFolder.name} » pour le moment.`
                : "Aucune recette sans dossier."
          }
        />
      )}

      {/* ── Vue 3 : tout afficher (liste plate groupée par dossier) ── */}
      {isAllView && (
        <AllRecipesView folders={folders} q={q} tag={tag} categoryId={categoryId} />
      )}

      {/* ── Vue explorateur + recherche/filtres : on bascule sur grid plate filtrée ── */}
      {isExplorerView && hasSearchOrFilters && (
        <RecipeGrid
          recipes={recipes}
          emptyTitle="Aucun résultat"
          emptyDescription="Aucune recette ne correspond aux filtres actifs."
        />
      )}

      <Fab href="/recipes/new" label="Créer une recette" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue explorateur
// ─────────────────────────────────────────────────────────────────────────────

function ExplorerView({
  folders,
  uncategorizedRecipes,
}: {
  folders: { id: number; name: string; color: string; _count: { recipes: number } }[];
  uncategorizedRecipes: Awaited<ReturnType<typeof listRecipes>>;
}) {
  const hasFolders = folders.length > 0;
  const hasUncategorized = uncategorizedRecipes.length > 0;

  if (!hasFolders && !hasUncategorized) {
    return (
      <EmptyState
        title="Aucune recette"
        description="Démarrez votre livre de pâtisserie en créant votre première recette."
        ctaHref="/recipes/new"
        ctaLabel="Créer ma première recette"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {hasFolders && (
        <section className="flex flex-col gap-3">
          <h2 className="fl-label" style={{ fontSize: "0.85rem" }}>
            📁 Dossiers
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {folders.map((f) => (
              <FolderCard
                key={f.id}
                id={f.id}
                name={f.name}
                color={f.color}
                count={f._count.recipes}
              />
            ))}
          </div>
        </section>
      )}

      {hasUncategorized && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="fl-label" style={{ fontSize: "0.85rem" }}>
              📂 Sans dossier ({uncategorizedRecipes.length})
            </h2>
            <Link
              href="/?folder=none"
              className="fl-label hover:text-[color:var(--text)]"
              style={{ fontSize: "0.75rem" }}
            >
              Voir tout →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {uncategorizedRecipes.slice(0, 6).map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Grid simple + état vide
// ─────────────────────────────────────────────────────────────────────────────

function RecipeGrid({
  recipes,
  emptyTitle,
  emptyDescription,
}: {
  recipes: Awaited<ReturnType<typeof listRecipes>>;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (recipes.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        ctaHref="/recipes/new"
        ctaLabel="Créer une recette"
      />
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {recipes.map((r) => (
        <RecipeCard key={r.id} recipe={r} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vue « Tout afficher » : groupée par dossier
// ─────────────────────────────────────────────────────────────────────────────

async function AllRecipesView({
  folders,
  q,
  tag,
  categoryId,
}: {
  folders: { id: number; name: string; color: string; _count: { recipes: number } }[];
  q?: string;
  tag?: string;
  categoryId?: number;
}) {
  const recipes = await listRecipes({ q, tag, categoryId });

  if (recipes.length === 0) {
    return (
      <EmptyState
        title="Aucune recette"
        description={
          q || tag || categoryId
            ? "Aucune recette ne correspond aux filtres actifs."
            : "Démarrez votre livre de pâtisserie en créant votre première recette."
        }
        ctaHref="/recipes/new"
        ctaLabel="Créer une recette"
      />
    );
  }

  // Group recipes by folderId
  const byFolder = new Map<number | "none", typeof recipes>();
  for (const r of recipes) {
    const key = r.folderId ?? "none";
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key)!.push(r);
  }

  // Ordre des dossiers : ceux qui ont des recettes en premier, puis « sans dossier » à la fin
  const orderedFolders = folders.filter((f) => byFolder.has(f.id));

  return (
    <div className="flex flex-col gap-6">
      {orderedFolders.map((f) => {
        const list = byFolder.get(f.id)!;
        return (
          <section key={f.id} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2
                className="fl-title-serif flex items-center gap-2"
                style={{ fontSize: "1.05rem", color: f.color }}
              >
                <span>📁</span>
                {f.name}
                <span className="fl-label" style={{ color: "var(--muted)" }}>
                  ({list.length})
                </span>
              </h2>
              <Link
                href={`/?folder=${f.id}`}
                className="fl-label hover:text-[color:var(--text)]"
                style={{ fontSize: "0.75rem" }}
              >
                Ouvrir le dossier →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((r) => (
                <RecipeCard key={r.id} recipe={r} />
              ))}
            </div>
          </section>
        );
      })}

      {byFolder.has("none") && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="fl-title-serif flex items-center gap-2" style={{ fontSize: "1.05rem" }}>
              <span>📂</span>
              Sans dossier
              <span className="fl-label">({byFolder.get("none")!.length})</span>
            </h2>
            <Link
              href="/?folder=none"
              className="fl-label hover:text-[color:var(--text)]"
              style={{ fontSize: "0.75rem" }}
            >
              Ouvrir →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {byFolder.get("none")!.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
