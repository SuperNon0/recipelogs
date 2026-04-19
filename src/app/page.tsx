import { RecipeCard } from "@/components/RecipeCard";
import { RecipeFilters } from "@/components/RecipeFilters";
import { Fab } from "@/components/Fab";
import { EmptyState } from "@/components/EmptyState";
import { listAllCategories, listAllTags, listRecipes } from "@/lib/recipes";

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

  const [recipes, tags, categories] = await Promise.all([
    listRecipes({ q, tag, categoryId }),
    listAllTags(),
    listAllCategories(),
  ]);

  return (
    <>
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Recettes
        </h1>
        <span className="fl-label">
          {recipes.length} {recipes.length > 1 ? "recettes" : "recette"}
        </span>
      </div>

      <RecipeFilters allTags={tags} allCategories={categories} />

      {recipes.length === 0 ? (
        <EmptyState
          title="Aucune recette"
          description={
            q || tag || categoryId
              ? "Aucune recette ne correspond aux filtres actifs."
              : "Démarrez votre livre de pâtisserie en créant votre première recette."
          }
          ctaHref="/recipes/new"
          ctaLabel="Créer ma première recette"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      )}

      <Fab href="/recipes/new" label="Créer une recette" />
    </>
  );
}
