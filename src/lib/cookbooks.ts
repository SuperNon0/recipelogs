import { prisma } from "./prisma";
import { scaleQty, recipeMass, type AdjIngredient } from "./massAdjust";
import { resolveLink } from "./recipeTree";
import { collectAllergens } from "./allergens";
import { loadRecipeTree } from "./recipes";

export async function listCookbooks() {
  return prisma.cookbook.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      template: true,
      _count: { select: { entries: true } },
    },
  });
}

export async function getCookbookDetail(id: number) {
  return prisma.cookbook.findUnique({
    where: { id },
    include: {
      template: true,
      entries: {
        orderBy: { position: "asc" },
        include: {
          recipe: {
            select: {
              id: true,
              name: true,
              updatedAt: true,
              categories: {
                include: { category: { select: { name: true, color: true } } },
              },
            },
          },
        },
      },
      chapters: {
        orderBy: { position: "asc" },
      },
    },
  });
}

/**
 * Snapshot complet d'une recette (une passe, sans récursion profonde),
 * utilisé pour les entrées 📌 figées dans les cahiers.
 *
 * @param multiplier coefficient appliqué à toutes les quantités (1 = inchangé).
 *                   Permet de figer une version multipliée de la recette.
 */
export async function buildRecipeSnapshot(recipeId: number, multiplier = 1) {
  const [r, tree] = await Promise.all([
    prisma.recipe.findUnique({
      where: { id: recipeId },
      include: {
        tags: { orderBy: { name: "asc" } },
        categories: { include: { category: true } },
      },
    }),
    // Arbre complet (sous-recettes imbriquées, poids des pièces…).
    loadRecipeTree(recipeId),
  ]);
  if (!r || !tree) return null;

  const k = multiplier > 0 ? multiplier : 1;

  const ingredients: AdjIngredient[] = tree.ingredients.map((i) => {
    const scaled = scaleQty(i.quantityG, i.unit, k);
    const scaledMax = i.quantityGMax != null ? scaleQty(i.quantityGMax, i.unit, k) : null;
    return {
      name: i.name,
      quantityG: scaled.quantityG,
      quantityGMax: scaledMax?.quantityG ?? null,
      unit: scaled.unit,
      pieceG: i.pieceG ?? null,
    };
  });
  const { min: totalMassGMin, max: totalMassGMax, avg: totalMassG } = recipeMass(ingredients);

  // Chaque sous-recette est résolue sur son arbre complet (sous-recettes
  // imbriquées comprises) : plus rien n'est oublié au-delà du 1er niveau.
  const memo = new Map();
  const subRecipes = tree.subLinks.map((link) => {
    const res = resolveLink(link, k, memo);
    return {
      label: link.label,
      childName: link.childName,
      calcMode: link.calcMode,
      calcValue: link.calcValue,
      isLocked: link.isLocked,
      isExact: link.isExact,
      ingredients: res.ingredients,
      totalMassG: (res.min + res.max) / 2,
      totalMassGMin: res.min,
      totalMassGMax: res.max,
      steps: link.child.steps,
      allergens: collectAllergens(link.child).map((a) => a.label),
    };
  });

  return {
    recipeId: r.id,
    name: r.name,
    source: r.source,
    notesTips: r.notesTips,
    rating: r.rating,
    photoPath: r.photoPath,
    tags: r.tags.map((t) => t.name),
    categories: r.categories.map((rc) => rc.category.name),
    ingredients,
    steps: tree.steps,
    totalMassG,
    totalMassGMin,
    totalMassGMax,
    subRecipes,
    multiplier: k,
    yield: yieldOf(r.yieldCount, r.yieldLabel, k),
    /** Allergènes de la recette entière (sous-recettes comprises). */
    allergens: collectAllergens(tree).map((a) => a.label),
  };
}

/** Rendement mis à l'échelle (« 60 financiers »), ou null s'il n'est pas renseigné. */
export function yieldOf(count: number | null, label: string | null, coef = 1): { count: number; label: string } | null {
  if (!count || count <= 0) return null;
  return { count: Math.round(count * coef * 10) / 10, label: label?.trim() || "pièces" };
}

export type RecipeSnapshot = Awaited<ReturnType<typeof buildRecipeSnapshot>>;
