"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

/**
 * Note l'ouverture d'une recette pour la page Historique.
 * En SQL brut : un update Prisma changerait aussi updated_at, et la recette
 * remonterait dans « Récemment modifiées » sans avoir été modifiée.
 */
export async function recordRecipeView(recipeId: number): Promise<void> {
  if (!Number.isInteger(recipeId) || recipeId <= 0) return;
  await prisma.$executeRaw`UPDATE "recipes" SET "last_viewed_at" = NOW() WHERE "id" = ${recipeId}`;
}

/** Vide l'historique (les recettes elles-mêmes ne sont pas touchées). */
export async function clearRecipeHistory(): Promise<void> {
  await prisma.$executeRaw`UPDATE "recipes" SET "last_viewed_at" = NULL WHERE "last_viewed_at" IS NOT NULL`;
  revalidatePath("/history");
  revalidatePath("/");
}
