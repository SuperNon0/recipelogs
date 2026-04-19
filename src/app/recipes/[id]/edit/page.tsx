import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/RecipeForm";
import { updateRecipe } from "@/app/actions/recipes";
import { getRecipeDetail, listAllCategories } from "@/lib/recipes";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isFinite(recipeId)) notFound();

  const [recipe, categories] = await Promise.all([
    getRecipeDetail(recipeId),
    listAllCategories(),
  ]);
  if (!recipe) notFound();

  const action = async (formData: FormData) => {
    "use server";
    await updateRecipe(recipeId, formData);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Éditer la recette
        </h1>
        <Link
          href={`/recipes/${recipeId}`}
          className="fl-label hover:text-[color:var(--text)]"
        >
          ← Retour
        </Link>
      </div>
      <RecipeForm
        action={action}
        submitLabel="Enregistrer"
        categories={categories}
        initial={{
          id: recipe.id,
          name: recipe.name,
          source: recipe.source,
          notesTips: recipe.notesTips,
          favorite: recipe.favorite,
          rating: recipe.rating,
          steps: recipe.stepsBlock?.content ?? "",
          tags: recipe.tags.map((t) => t.name),
          categoryIds: recipe.categories.map((c) => c.categoryId),
          ingredients: recipe.ingredients.map((i) => ({
            name: i.name ?? i.ingredientBase?.name ?? "",
            quantityG: Number(i.quantityG),
          })),
        }}
      />
    </div>
  );
}
