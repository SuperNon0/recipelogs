"use server";

import { prisma } from "@/lib/prisma";
import { recipeMass } from "@/lib/massAdjust";

export async function fetchAvailableRecipes(excludeId: number): Promise<{ id: number; name: string }[]> {
  return prisma.recipe.findMany({
    where: { id: { not: excludeId } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function fetchCookbooksForModal(): Promise<{ id: number; name: string }[]> {
  return prisma.cookbook.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function fetchShoppingListsForModal(): Promise<{ id: number; name: string }[]> {
  return prisma.shoppingList.findMany({
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Masse et ingrédients d'une recette (fenêtre « Ajouter au cahier » ouverte depuis une liste). */
export async function fetchRecipeMassInfo(
  recipeId: number,
): Promise<{ totalMassG: number; ingredients: { name: string; quantityG: number }[] } | null> {
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
