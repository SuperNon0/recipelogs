"use server";

import { prisma } from "@/lib/prisma";

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
