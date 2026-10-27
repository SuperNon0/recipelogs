import { prisma } from "./prisma";
import { loadRecipeTree } from "./recipes";
import { treeBaseMass } from "./recipeTree";

/**
 * Variantes d'une recette : une recette d'origine (« version principale ») et
 * ses essais, reliés par la table `variants` (source = origine, variant = essai).
 * Un seul niveau : la variante d'une variante est rattachée à la même origine.
 */

export type VariantMember = {
  id: number;
  name: string;
  /** Petit nom de l'essai (« moins sucré ») ; null pour la version principale. */
  note: string | null;
  isRoot: boolean;
  massG: number;
  updatedAt: string;
};

export type VariantFamily = { rootId: number; members: VariantMember[] };

/** Origine de la famille d'une recette (elle-même si ce n'est pas une variante). */
export async function variantRootOf(recipeId: number): Promise<number> {
  const link = await prisma.variant.findFirst({ where: { variantRecipeId: recipeId }, select: { sourceRecipeId: true } });
  return link?.sourceRecipeId ?? recipeId;
}

/** Famille d'une recette : origine puis variantes (de la plus ancienne à la plus récente). null s'il n'y a aucune variante. */
export async function getVariantFamily(recipeId: number): Promise<VariantFamily | null> {
  const rootId = await variantRootOf(recipeId);
  const links = await prisma.variant.findMany({
    where: { sourceRecipeId: rootId },
    orderBy: { id: "asc" },
    select: { variantRecipeId: true, note: true },
  });
  if (links.length === 0) return null;

  const ids = [rootId, ...links.map((l) => l.variantRecipeId)];
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, updatedAt: true },
  });
  // Masse de toute la recette (sous-recettes et poids des pièces compris), comme la fiche.
  const masses = new Map(
    await Promise.all(ids.map(async (id) => {
      const tree = await loadRecipeTree(id);
      return [id, tree ? treeBaseMass(tree).avg : 0] as const;
    })),
  );
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const notes = new Map(links.map((l) => [l.variantRecipeId, l.note]));

  const members: VariantMember[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    members.push({
      id,
      name: r.name,
      note: id === rootId ? null : notes.get(id) ?? null,
      isRoot: id === rootId,
      massG: masses.get(id) ?? 0,
      updatedAt: r.updatedAt.toISOString(),
    });
  }
  return { rootId, members };
}
