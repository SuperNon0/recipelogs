"use server";

import { requireAccess } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { visibleShoppingListWhere } from "@/lib/shopping";
import { ingMass } from "@/lib/massAdjust";
import { loadRecipeTree } from "@/lib/recipes";
import { stripTreeCosts, treeScaledMass, type TreeNode } from "@/lib/recipeTree";
import { canSeeRecipe, hiddenCookbookIds, visibleRecipeWhere } from "@/lib/auth/visibility";

export async function fetchAvailableRecipes(excludeId: number): Promise<{ id: number; name: string }[]> {
  await requireAccess("read");
  return prisma.recipe.findMany({
    where: { AND: [{ id: { not: excludeId } }, await visibleRecipeWhere()] },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function fetchCookbooksForModal(): Promise<{ id: number; name: string }[]> {
  await requireAccess("read");
  const hidden = await hiddenCookbookIds();
  return prisma.cookbook.findMany({
    where: hidden.size ? { id: { notIn: [...hidden] } } : undefined,
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function fetchShoppingListsForModal(): Promise<{ id: number; name: string }[]> {
  await requireAccess("read");
  return prisma.shoppingList.findMany({ where: await visibleShoppingListWhere(),
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Masse et ingrédients d'une recette (fenêtre « Ajouter au cahier » ouverte depuis une liste). */
export async function fetchRecipeMassInfo(
  recipeId: number,
): Promise<{ totalMassG: number; tree: TreeNode; ingredients: { name: string; quantityG: number }[] } | null> {
  await requireAccess("read");
  if (!(await canSeeRecipe(recipeId))) return null;
  const tree = await loadRecipeTree(recipeId);
  if (!tree) return null;
  // La fenêtre a besoin de l'arbre pour la masse, jamais des prix d'achat.
  stripTreeCosts(tree);
  return {
    totalMassG: treeScaledMass(tree, 1),
    tree,
    ingredients: tree.ingredients.map((i) => ({ name: i.name, quantityG: ingMass(i.quantityG, i.unit, i.pieceG) })).filter((i) => i.quantityG > 0),
  };
}

/** Ingrédients d'une recette (choix de l'ingrédient pivot d'une sous-recette). */
export async function fetchRecipeIngredients(
  recipeId: number,
): Promise<{ id: number; name: string; quantityG: number; unit: string }[]> {
  await requireAccess("read");
  if (!(await canSeeRecipe(recipeId))) return [];
  const rows = await prisma.ingredient.findMany({
    where: { recipeId },
    orderBy: { position: "asc" },
    select: { id: true, name: true, quantityG: true, unit: true, ingredientBase: { select: { name: true } } },
  });
  return rows.map((i) => ({
    id: i.id,
    name: i.name ?? i.ingredientBase?.name ?? "—",
    quantityG: Number(i.quantityG),
    unit: i.unit,
  }));
}
