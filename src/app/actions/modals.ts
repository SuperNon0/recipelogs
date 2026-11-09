"use server";

import { requireAccess } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { visibleShoppingListWhere } from "@/lib/shopping";
import { recipeMass } from "@/lib/massAdjust";
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
): Promise<{ totalMassG: number; ingredients: { name: string; quantityG: number }[] } | null> {
  await requireAccess("read");
  if (!(await canSeeRecipe(recipeId))) return null;
  const r = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: {
      ingredients: {
        orderBy: { position: "asc" },
        select: { name: true, quantityG: true, quantityGMax: true, unit: true, ingredientBase: { select: { name: true } } },
      },
    },
  });
  if (!r) return null;
  const ings = r.ingredients.map((i) => ({
    quantityG: Number(i.quantityG),
    quantityGMax: i.quantityGMax != null ? Number(i.quantityGMax) : null,
    unit: i.unit,
  }));
  return {
    totalMassG: recipeMass(ings).avg,
    ingredients: r.ingredients.map((i) => ({ name: i.name ?? i.ingredientBase?.name ?? "—", quantityG: Number(i.quantityG) })),
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
