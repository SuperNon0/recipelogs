import { cache } from "react";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getViewer, viewerCan } from "./viewer";

/**
 * Recettes visibles par le visiteur.
 *
 * Un rôle sans la permission « Voir toutes les recettes » (un apprenti, par
 * exemple) ne voit que les recettes des catégories cochées sur son rôle,
 * plus les sous-recettes qu'elles utilisent (à tous les niveaux) : sans elles,
 * il ne pourrait pas faire la recette.
 *
 * null = tout est visible (comptes désactivés, outils MCP, rôle avec la permission).
 */
export const visibleRecipeIds = cache(async (): Promise<Set<number> | null> => {
  const viewer = await getViewer();
  if (viewerCan(viewer, "recipes.view_all")) return null;
  if (viewer.kind !== "account" || !viewer.account.role) return new Set();
  const categoryIds = viewer.account.role.categoryIds;
  if (categoryIds.length === 0) return new Set();

  const [base, links] = await Promise.all([
    prisma.recipeCategory.findMany({ where: { categoryId: { in: categoryIds } }, select: { recipeId: true } }),
    prisma.subRecipe.findMany({ select: { parentId: true, childId: true } }),
  ]);
  return expandWithSubRecipes(
    base.map((b) => b.recipeId),
    links,
  );
});

/** Ajoute aux recettes données toutes leurs sous-recettes, à tous les niveaux. */
export function expandWithSubRecipes(ids: number[], links: { parentId: number; childId: number }[]): Set<number> {
  const children = new Map<number, number[]>();
  for (const l of links) children.set(l.parentId, [...(children.get(l.parentId) ?? []), l.childId]);
  const seen = new Set<number>();
  const stack = [...ids];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return seen;
}

/** Filtre Prisma des recettes visibles ({} = toutes). */
export async function visibleRecipeWhere(): Promise<Prisma.RecipeWhereInput> {
  const ids = await visibleRecipeIds();
  return ids ? { id: { in: [...ids] } } : {};
}

export async function canSeeRecipe(id: number): Promise<boolean> {
  const ids = await visibleRecipeIds();
  return !ids || ids.has(id);
}

/** Page d'une recette cachée au visiteur : « introuvable », comme si elle n'existait pas. */
export async function requireVisibleRecipe(id: number): Promise<void> {
  if (!(await canSeeRecipe(id))) notFound();
}

/** Garde seulement les éléments dont la recette est visible. */
export async function filterVisible<T>(items: T[], recipeId: (t: T) => number): Promise<T[]> {
  const ids = await visibleRecipeIds();
  return ids ? items.filter((t) => ids.has(recipeId(t))) : items;
}

/** Un cahier n'est visible que si toutes ses recettes le sont. */
export async function hiddenCookbookIds(): Promise<Set<number>> {
  const ids = await visibleRecipeIds();
  if (!ids) return new Set();
  const entries = await prisma.cookbookRecipe.findMany({ select: { cookbookId: true, recipeId: true } });
  return new Set(entries.filter((e) => e.recipeId != null && !ids.has(e.recipeId)).map((e) => e.cookbookId));
}

/** Cahier qui contient une recette cachée au visiteur : « introuvable ». */
export async function requireVisibleCookbook(id: number): Promise<void> {
  if ((await hiddenCookbookIds()).has(id)) notFound();
}
