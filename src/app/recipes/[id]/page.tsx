import { notFound } from "next/navigation";
import { getRecipeDetail, listAllFolders, loadRecipeTree } from "@/lib/recipes";
import { listPdfThemes } from "@/lib/pdfThemes";
import { recipeMass } from "@/lib/massAdjust";
import { collectAllergens } from "@/lib/allergens";
import { parseMold } from "@/lib/mold";
import { getVariantFamily } from "@/lib/variants";
import type { SubRecipeRow } from "@/components/RecipeBody";
import { RecipeView } from "@/components/recipe/RecipeView";
import { RecipeMenuProvider } from "@/components/recipe/RecipeMenu";

export const dynamic = "force-dynamic";

export default async function RecipePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; variantes?: string }>;
}) {
  const { id } = await params;
  const { from, variantes } = await searchParams;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) notFound();

  const [recipe, folders, themes, tree, variants] = await Promise.all([
    getRecipeDetail(recipeId),
    listAllFolders(),
    listPdfThemes(),
    loadRecipeTree(recipeId),
    getVariantFamily(recipeId),
  ]);
  if (!recipe) notFound();

  // Retour : vers la liste d'où l'on vient, sinon vers le dossier de la recette.
  const back =
    from && from.startsWith("/")
      ? { href: from, label: from.includes("folder=") ? recipe.folder?.name ?? "Dossier" : "Recettes" }
      : recipe.folder
        ? { href: `/?folder=${recipe.folder.id}`, label: recipe.folder.name }
        : { href: "/", label: "Recettes" };

  // Ingrédients de la recette, avec le poids des pièces lu sur leur fiche.
  const ingredients = tree?.ingredients ?? [];

  // Arbre complet (sous-recettes imbriquées comprises) : le calcul de masse et
  // la liste des ingrédients de chaque sous-recette tiennent compte de tous les niveaux.
  const subRecipes: SubRecipeRow[] = (tree?.subLinks ?? []).map((link) => ({
    id: link.id,
    childId: link.childId,
    childName: link.childName,
    label: link.label,
    calcMode: link.calcMode,
    calcValue: link.calcValue,
    pivotIngredientId: link.pivotIngredientId,
    isLocked: link.isLocked,
    isExact: link.isExact,
    childIngredients: link.child.ingredients,
    childSteps: link.child.steps,
    childTree: link.child,
  }));

  return (
    <RecipeMenuProvider folders={folders.map((f) => ({ id: f.id, name: f.name, color: f.color }))} themes={themes}>
      {/* `key` : repart d'un état neuf (multiplicateur, verrous) après chaque modification. */}
      <RecipeView
        key={recipe.updatedAt.toISOString() + recipe.parentLinks.map((l) => `${l.id}:${l.calcMode}:${l.calcValue}:${l.label}`).join(",")}
        back={back}
        recipe={{
          id: recipe.id,
          name: recipe.name,
          photoPath: recipe.photoPath,
          favorite: recipe.favorite,
          rating: recipe.rating,
          source: recipe.source,
          notesTips: recipe.notesTips,
          steps: recipe.stepsBlock?.content ?? null,
          folder: recipe.folder ? { id: recipe.folder.id, name: recipe.folder.name, color: recipe.folder.color } : null,
          categories: recipe.categories.map((c) => ({ id: c.category.id, name: c.category.name, color: c.category.color })),
          tags: recipe.tags.map((t) => t.name),
          createdAt: recipe.createdAt.toISOString(),
          updatedAt: recipe.updatedAt.toISOString(),
          totalMassG: recipeMass(ingredients).avg,
          saleCoef: recipe.saleCoef != null ? Number(recipe.saleCoef) : null,
        }}
        ingredients={ingredients}
        subRecipes={subRecipes}
        mold={parseMold(recipe.mold)}
        variants={variants}
        openVariants={variantes === "1"}
        allergens={tree ? collectAllergens(tree) : []}
        yieldInfo={recipe.yieldCount ? { count: recipe.yieldCount, label: recipe.yieldLabel?.trim() || "pièces" } : null}
        comments={recipe.comments.map((c) => ({ id: c.id, content: c.content, createdAt: c.createdAt.toISOString() }))}
        usedIn={recipe.childLinks.map((l) => ({ id: l.parent.id, name: l.parent.name, label: l.label }))}
      />
    </RecipeMenuProvider>
  );
}
