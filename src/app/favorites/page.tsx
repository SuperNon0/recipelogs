import Link from "next/link";
import { Plus, Star } from "lucide-react";
import {
  RecipeSelectionProvider,
  RecipeSelectionToggle,
} from "@/components/RecipeSelection";
import { EmptyState } from "@/components/EmptyState";
import { RecipeTable } from "@/components/recipe/RecipeTable";
import { RecipeMenuProvider } from "@/components/recipe/RecipeMenu";
import { listAllFolders, listRecipes, toRecipeRows } from "@/lib/recipes";
import { listPdfThemes } from "@/lib/pdfThemes";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const [recipes, folders, themes] = await Promise.all([
    listRecipes({ favoritesOnly: true }),
    listAllFolders(),
    listPdfThemes(),
  ]);
  const folderOptions = folders.map((f) => ({ id: f.id, name: f.name, color: f.color }));

  return (
    <RecipeMenuProvider folders={folderOptions} themes={themes}>
      <RecipeSelectionProvider>
        <div className="page-head">
          <h1>Favoris</h1>
          {recipes.length > 0 && <RecipeSelectionToggle />}
          <Link href="/recipes/new" className="fl-btn fl-btn-primary desk-only">
            <Plus size={16} /> Nouvelle recette
          </Link>
          <p className="sub">
            {recipes.length} recette{recipes.length > 1 ? "s" : ""}
          </p>
        </div>

        {recipes.length === 0 ? (
          <EmptyState
            icon={Star}
            title="Aucun favori"
            description="Ajoute une recette aux favoris depuis sa fiche ou son menu pour la retrouver ici."
          />
        ) : (
          <RecipeTable recipes={toRecipeRows(recipes)} folders={folderOptions} />
        )}

        <Link href="/recipes/new" className="fab" aria-label="Créer une recette">
          <Plus size={24} />
        </Link>
      </RecipeSelectionProvider>
    </RecipeMenuProvider>
  );
}
