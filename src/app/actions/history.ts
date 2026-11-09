"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAccess } from "@/lib/auth/guard";
import { canSeeRecipe } from "@/lib/auth/visibility";

/**
 * Note l'ouverture d'une recette pour la page Historique.
 * En SQL brut : un update Prisma changerait aussi updated_at, et la recette
 * remonterait dans « Récemment modifiées » sans avoir été modifiée.
 */
export async function recordRecipeView(recipeId: number): Promise<void> {
  const viewer = await requireAccess("read");
  if (!Number.isInteger(recipeId) || recipeId <= 0 || !(await canSeeRecipe(recipeId))) return;
  if (viewer.kind === "account") {
    if (viewer.realAccount) return;
    const accountId = viewer.account.id;
    if (!(await prisma.recipe.findUnique({ where: { id: recipeId }, select: { id: true } }))) return;
    await prisma.accountRecipeView.upsert({
      where: { accountId_recipeId: { accountId, recipeId } },
      create: { accountId, recipeId },
      update: { viewedAt: new Date() },
    });
    return;
  }
  await prisma.$executeRaw`UPDATE "recipes" SET "last_viewed_at" = NOW() WHERE "id" = ${recipeId}`;
}

/** Vide l'historique (les recettes elles-mêmes ne sont pas touchées). */
export async function clearRecipeHistory(): Promise<void> {
  const viewer = await requireAccess("read");
  if (viewer.kind === "account") {
    if (viewer.realAccount) return;
    await prisma.accountRecipeView.deleteMany({ where: { accountId: viewer.account.id } });
  } else {
    await prisma.$executeRaw`UPDATE "recipes" SET "last_viewed_at" = NULL WHERE "last_viewed_at" IS NOT NULL`;
  }
  revalidatePath("/history");
  revalidatePath("/");
}
