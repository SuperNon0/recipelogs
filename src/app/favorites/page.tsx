import { RecipeCard } from "@/components/RecipeCard";
import {
  RecipeSelectionProvider,
  RecipeSelectionToggle,
} from "@/components/RecipeSelection";
import { EmptyState } from "@/components/EmptyState";
import { Fab } from "@/components/Fab";
import { listRecipes } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function FavoritesPage() {
  const recipes = await listRecipes({ favoritesOnly: true });

  return (
    <RecipeSelectionProvider>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Favoris
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="fl-label">
            {recipes.length} {recipes.length > 1 ? "recettes" : "recette"}
          </span>
          {recipes.length > 0 && <RecipeSelectionToggle />}
        </div>
      </div>

      {recipes.length === 0 ? (
        <EmptyState
          title="Aucun favori"
          description="Marquez une recette comme favorite depuis sa fiche pour la retrouver ici."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      <Fab href="/recipes/new" label="Créer une recette" />
    </RecipeSelectionProvider>
  );
}
