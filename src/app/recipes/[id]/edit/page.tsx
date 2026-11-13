import { parseMold } from "@/lib/mold";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { RecipeForm } from "@/components/RecipeForm";
import { updateRecipe } from "@/app/actions/recipes";
import { getRecipeDetail, listAllCategories, listAllFolders } from "@/lib/recipes";
import { listPieceWeights } from "@/lib/ingredientInfo";
import { requirePage } from "@/lib/auth/guard";
import { requireVisibleRecipe } from "@/lib/auth/visibility";

export const dynamic = "force-dynamic";

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePage("recipes.edit");
  const { id } = await params;
  const recipeId = Number(id);
  await requireVisibleRecipe(recipeId);
  if (!Number.isFinite(recipeId)) notFound();

  const [recipe, categories, folders, pieceWeights] = await Promise.all([
    getRecipeDetail(recipeId),
    listAllCategories(),
    listAllFolders(),
    listPieceWeights(),
  ]);
  if (!recipe) notFound();

  const action = async (formData: FormData) => {
    "use server";
    await updateRecipe(recipeId, formData);
  };

  return (
    <div>
      <Link href={`/recipes/${recipeId}`} className="crumb">
        <ChevronLeft size={14} /> {recipe.name}
      </Link>
      <div className="page-head">
        <h1>Modifier la recette</h1>
      </div>
      <RecipeForm
        action={action}
        submitLabel="Enregistrer"
        categories={categories}
        folders={folders}
        pieceWeights={pieceWeights}
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
          folderId: recipe.folderId,
          yieldCount: recipe.yieldCount,
          yieldLabel: recipe.yieldLabel,
          mold: parseMold(recipe.mold),
          ingredients: recipe.ingredients.map((i) => ({
            name: i.name ?? i.ingredientBase?.name ?? "",
            quantityG: Number(i.quantityG),
            quantityGMax: i.quantityGMax != null ? Number(i.quantityGMax) : null,
            unit: i.unit ?? "g",
          })),
          subRecipes: recipe.parentLinks.map((l) => ({
            label: l.label,
            childName: l.child.name,
            calcMode: l.calcMode,
            calcValue: Number(l.calcValue),
          })),
        }}
      />
    </div>
  );
}
