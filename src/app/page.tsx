import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";
import { RecipeFilters } from "@/components/RecipeFilters";
import { AddRecipesToFolderButton } from "@/components/AddRecipesToFolderButton";
import {
  RecipeSelectionProvider,
  RecipeSelectionToggle,
} from "@/components/RecipeSelection";
import { EmptyState } from "@/components/EmptyState";
import { FolderTiles } from "@/components/recipe/FolderTiles";
import { RecipeTable } from "@/components/recipe/RecipeTable";
import { RecipeMenuProvider } from "@/components/recipe/RecipeMenu";
import { Help } from "@/components/ui/Help";
import {
  listAllCategories,
  listAllFolders,
  listAllTags,
  countHiddenVariants,
  listRecipes,
  toRecipeRows,
} from "@/lib/recipes";
import { listPdfThemes } from "@/lib/pdfThemes";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const tag = typeof sp.tag === "string" ? sp.tag : undefined;
  const categoryId = typeof sp.category === "string" ? Number(sp.category) : undefined;
  const folderParam = typeof sp.folder === "string" ? sp.folder : undefined;
  const withVariants = sp.variantes === "1";

  // Dossier ouvert : "none" = sans dossier, "42" = ce dossier, sinon toutes les recettes.
  let folderFilter: number | "none" | undefined = undefined;
  if (folderParam === "none") folderFilter = "none";
  else if (folderParam && /^\d+$/.test(folderParam)) folderFilter = Number(folderParam);

  const hasFilters = !!(q || tag || categoryId);

  const [tags, categories, folders, recipes, themes, hiddenVariants] = await Promise.all([
    listAllTags(),
    listAllCategories(),
    listAllFolders(),
    listRecipes({ q, tag, categoryId, folderId: folderFilter, withVariants }),
    listPdfThemes(),
    hasFilters || withVariants ? 0 : countHiddenVariants(folderFilter),
  ]);

  const currentFolder =
    typeof folderFilter === "number" ? folders.find((f) => f.id === folderFilter) ?? null : null;
  const inFolder = folderFilter !== undefined;
  const title = folderFilter === "none" ? "Sans dossier" : currentFolder ? currentFolder.name : "Recettes";
  const folderOptions = folders.map((f) => ({ id: f.id, name: f.name, color: f.color }));
  const noFolderCount = inFolder || hasFilters ? 0 : recipes.filter((r) => r.folderId === null).length;
  const from = folderParam ? `/?folder=${folderParam}` : undefined;

  return (
    <RecipeMenuProvider folders={folderOptions} themes={themes}>
      <RecipeSelectionProvider>
        {inFolder && (
          <Link href="/" className="crumb">
            <ChevronLeft size={14} /> Recettes
          </Link>
        )}
        <div className="page-head">
          {currentFolder && <span className="dot" style={{ background: currentFolder.color, width: 12, height: 12 }} />}
          <h1>{title}</h1>
          <RecipeSelectionToggle />
          {currentFolder && (
            <AddRecipesToFolderButton
              folder={{ id: currentFolder.id, name: currentFolder.name, color: currentFolder.color }}
            />
          )}
          <Link href="/recipes/new" className="fl-btn fl-btn-primary desk-only">
            <Plus size={16} /> Nouvelle recette
          </Link>
          <p className="sub">
            {recipes.length} recette{recipes.length > 1 ? "s" : ""}
            {hasFilters ? " correspondant aux filtres" : ""}
            {hiddenVariants > 0 && (
              <>
                {" · "}
                <Link href={variantsHref(folderParam, true)} style={{ color: "var(--soft)" }}>
                  {hiddenVariants} variante{hiddenVariants > 1 ? "s" : ""} {hiddenVariants > 1 ? "rangées sous leur recette" : "rangée sous sa recette"}
                </Link>
              </>
            )}
            {withVariants && (
              <>
                {" · variantes affichées · "}
                <Link href={variantsHref(folderParam, false)} style={{ color: "var(--soft)" }}>
                  les ranger
                </Link>
              </>
            )}
          </p>
        </div>

        <RecipeFilters allTags={tags} allCategories={categories} />

        {!inFolder && !hasFilters && folders.length > 0 && (
          <>
            <div className="sect-title" style={{ marginTop: 8 }}>
              <h2 style={{ display: "flex", alignItems: "center" }}>
                Dossiers
                <Help title="Dossiers">
                  Range tes recettes par famille (tartes, entremets…). Une recette est dans un seul
                  dossier, ou dans « Sans dossier ». Clic droit (ou bouton à trois points) sur un
                  dossier pour y ranger des recettes ; sur une recette, « Déplacer vers » la change de
                  dossier.
                </Help>
              </h2>
              <Link href="/settings/folders">Gérer</Link>
            </div>
            <FolderTiles
              folders={folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes }))}
              noFolderCount={noFolderCount}
            />
          </>
        )}

        {!inFolder && !hasFilters && recipes.length > 0 && (
          <div className="sect-title">
            <h2>Récemment modifiées</h2>
          </div>
        )}

        {recipes.length === 0 ? (
          <EmptyState
            title={hasFilters ? "Aucun résultat" : inFolder ? "Dossier vide" : "Aucune recette"}
            description={
              hasFilters
                ? "Aucune recette ne correspond aux filtres actifs."
                : currentFolder
                  ? `Aucune recette dans « ${currentFolder.name} » pour le moment.`
                  : inFolder
                    ? "Toutes tes recettes sont rangées dans un dossier."
                    : "Démarre ton livre de pâtisserie en créant ta première recette."
            }
            ctaHref="/recipes/new"
            ctaLabel="Créer une recette"
          />
        ) : (
          <RecipeTable recipes={toRecipeRows(recipes)} folders={folderOptions} from={from} showFolder={!inFolder} />
        )}

        <Link href="/recipes/new" className="fab" aria-label="Créer une recette">
          <Plus size={24} />
        </Link>
      </RecipeSelectionProvider>
    </RecipeMenuProvider>
  );
}

/** Lien vers la liste avec ou sans les variantes, en gardant le dossier ouvert. */
function variantsHref(folder: string | undefined, show: boolean): string {
  const p = new URLSearchParams();
  if (folder) p.set("folder", folder);
  if (show) p.set("variantes", "1");
  const qs = p.toString();
  return qs ? `/?${qs}` : "/";
}
