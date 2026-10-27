"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { copyRecipe } from "@/lib/recipeCopy";
import { variantRootOf } from "@/lib/variants";

type Result = { ok: true; id?: number } | { ok: false; error: string };

const cleanNote = (note: string) => note.trim().slice(0, 120) || null;

function refresh(...ids: number[]) {
  revalidatePath("/");
  for (const id of ids) revalidatePath(`/recipes/${id}`);
}

/**
 * Nouvelle variante : copie de la recette affichée (avec ses réglages), reliée
 * à la version principale de sa famille. Renvoie l'id de la copie.
 */
export async function createVariant(recipeId: number, note: string): Promise<Result> {
  const source = await prisma.recipe.findUnique({ where: { id: recipeId }, select: { name: true } });
  if (!source) return { ok: false, error: "Recette introuvable." };
  const rootId = await variantRootOf(recipeId);
  const root = rootId === recipeId ? source : await prisma.recipe.findUnique({ where: { id: rootId }, select: { name: true } });
  const n = cleanNote(note);
  const count = await prisma.variant.count({ where: { sourceRecipeId: rootId } });
  const name = `${root?.name ?? source.name} · ${n ?? `essai ${count + 2}`}`.slice(0, 200);

  const id = await copyRecipe(recipeId, name);
  try {
    await prisma.variant.create({ data: { sourceRecipeId: rootId, variantRecipeId: id, note: n } });
  } catch {
    // Pas de copie orpheline si le lien échoue.
    await prisma.recipe.delete({ where: { id } }).catch(() => {});
    return { ok: false, error: "La variante n'a pas pu être créée. Réessaie." };
  }
  refresh(recipeId, rootId, id);
  return { ok: true, id };
}

/**
 * Relie une recette existante comme variante de `recipeId` (de sa famille).
 * Si l'autre recette avait déjà ses propres variantes, elles suivent.
 */
export async function linkVariant(recipeId: number, otherId: number, note: string): Promise<Result> {
  if (recipeId === otherId) return { ok: false, error: "Choisis une autre recette." };
  const found = await prisma.recipe.count({ where: { id: { in: [recipeId, otherId] } } });
  if (found < 2) return { ok: false, error: "Recette introuvable." };
  const rootId = await variantRootOf(recipeId);
  const otherRoot = await variantRootOf(otherId);
  if (otherRoot === rootId) return { ok: false, error: "Cette recette est déjà une variante de la même famille." };
  if (otherRoot !== otherId) return { ok: false, error: "Cette recette est déjà la variante d'une autre recette. Détache-la d'abord." };

  await prisma.$transaction([
    // Les variantes de l'autre recette rejoignent la nouvelle famille.
    prisma.variant.updateMany({ where: { sourceRecipeId: otherId }, data: { sourceRecipeId: rootId } }),
    prisma.variant.create({ data: { sourceRecipeId: rootId, variantRecipeId: otherId, note: cleanNote(note) } }),
  ]);
  refresh(recipeId, rootId, otherId);
  return { ok: true };
}

/** Détache une variante : elle redevient une recette indépendante. */
export async function unlinkVariant(variantId: number): Promise<Result> {
  const link = await prisma.variant.findFirst({ where: { variantRecipeId: variantId } });
  if (!link) return { ok: false, error: "Cette recette n'est pas une variante." };
  await prisma.variant.delete({ where: { id: link.id } });
  refresh(variantId, link.sourceRecipeId);
  return { ok: true };
}

/** Renomme le petit nom d'une variante (« moins sucré »). */
export async function setVariantNote(variantId: number, note: string): Promise<Result> {
  const { count } = await prisma.variant.updateMany({ where: { variantRecipeId: variantId }, data: { note: cleanNote(note) } });
  if (!count) return { ok: false, error: "Cette recette n'est pas une variante." };
  refresh(variantId);
  return { ok: true };
}

/**
 * Fait d'une variante la version principale : l'ancienne version principale
 * devient une variante (« ancienne version »), les autres essais suivent.
 */
export async function promoteVariant(variantId: number): Promise<Result> {
  const link = await prisma.variant.findFirst({ where: { variantRecipeId: variantId } });
  if (!link) return { ok: false, error: "Cette recette est déjà la version principale." };
  const oldRoot = link.sourceRecipeId;
  await prisma.$transaction([
    prisma.variant.delete({ where: { id: link.id } }),
    prisma.variant.updateMany({ where: { sourceRecipeId: oldRoot }, data: { sourceRecipeId: variantId } }),
    prisma.variant.create({ data: { sourceRecipeId: variantId, variantRecipeId: oldRoot, note: "ancienne version" } }),
  ]);
  refresh(variantId, oldRoot);
  return { ok: true };
}
