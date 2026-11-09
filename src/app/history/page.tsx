import { History } from "lucide-react";
import {
  RecipeSelectionProvider,
  RecipeSelectionToggle,
} from "@/components/RecipeSelection";
import { EmptyState } from "@/components/EmptyState";
import { RecipeTable } from "@/components/recipe/RecipeTable";
import { RecipeMenuProvider } from "@/components/recipe/RecipeMenu";
import { ClearHistoryButton } from "@/components/recipe/ClearHistoryButton";
import { listAllFolders, listRecipes, toRecipeRows } from "@/lib/recipes";
import { listPdfThemes } from "@/lib/pdfThemes";

export const dynamic = "force-dynamic";

/** Nombre de recettes gardées dans l'historique. */
const HISTORY_SIZE = 30;

export default async function HistoryPage() {
  const [recipes, folders, themes] = await Promise.all([
    listRecipes({ recentlyViewed: HISTORY_SIZE }),
    listAllFolders(),
    listPdfThemes(),
  ]);
  const folderOptions = folders.map((f) => ({ id: f.id, name: f.name, color: f.color }));

  return (
    <RecipeMenuProvider folders={folderOptions} themes={themes}>
      <RecipeSelectionProvider>
        <div className="page-head">
          <h1>Historique</h1>
          {recipes.length > 0 && <RecipeSelectionToggle />}
          {recipes.length > 0 && <ClearHistoryButton />}
          <p className="sub">
            {recipes.length === 0
              ? "Les recettes que tu ouvres"
              : `${recipes.length} dernière${recipes.length > 1 ? "s" : ""} recette${recipes.length > 1 ? "s" : ""} ouverte${recipes.length > 1 ? "s" : ""}, la plus récente en haut`}
          </p>
        </div>

        {recipes.length === 0 ? (
          <EmptyState
            icon={History}
            title="Historique vide"
            description="Chaque recette que tu ouvres apparaît ici, même si tu ne la modifies pas : pratique pour retrouver celle dont tu as oublié le nom."
          />
        ) : (
          <RecipeTable recipes={toRecipeRows(recipes)} folders={folderOptions} from="/history" dates="viewed" />
        )}
      </RecipeSelectionProvider>
    </RecipeMenuProvider>
  );
}
