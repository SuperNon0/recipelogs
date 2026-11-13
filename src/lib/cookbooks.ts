import { prisma } from "./prisma";
import { adjustToTarget, scaleQty, recipeMass, type AdjIngredient } from "./massAdjust";
import { resolveLink, treeCoefficientForMass } from "./recipeTree";
import { collectAllergens } from "./allergens";
import { loadRecipeTree } from "./recipes";
import { hiddenCookbookIds } from "./auth/visibility";

export async function listCookbooks() {
  // Rôle limité à certaines catégories : un cahier avec une recette cachée est caché.
  const hidden = await hiddenCookbookIds();
  return prisma.cookbook.findMany({
    where: hidden.size ? { id: { notIn: [...hidden] } } : undefined,
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
export async function buildRecipeSnapshot(recipeId: number, multiplier = 1, massTarget?: { target: number; exact?: boolean }) {
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

  const k = massTarget ? treeCoefficientForMass(tree, massTarget.target) : multiplier > 0 && Number.isFinite(multiplier) ? multiplier : 1;

  const ingredients: AdjIngredient[] = tree.ingredients.map((i) => {
    const scaled = scaleQty(i.quantityG, i.unit, k);
    const scaledMax = i.quantityGMax != null ? scaleQty(i.quantityGMax, i.unit, k) : null;
    return {
      name: i.name,
      quantityG: scaled.quantityG,
      quantityGMax: scaledMax?.quantityG ?? null,
      unit: scaled.unit,
      pieceG: i.pieceG ?? null,
      cost: i.cost ?? null,
    };
  });

  // Chaque sous-recette est résolue sur son arbre complet (sous-recettes
  // imbriquées comprises) : plus rien n'est oublié au-delà du 1er niveau.
  const memo = new Map();
  const subFixed: boolean[][] = [];
  const subRecipes = tree.subLinks.map((link) => {
    const res = resolveLink(link, k, memo);
    subFixed.push(res.fixed.map((fixed) => fixed || link.isLocked));
    return {
      label: link.label,
      childName: link.childName,
      calcMode: link.calcMode,
      calcValue: link.calcValue,
      isLocked: link.isLocked,
      isExact: link.isExact,
      ingredients: res.ingredients,
      fixedIngredients: res.fixed.map((fixed) => fixed || link.isLocked),
      totalMassG: (res.min + res.max) / 2,
      totalMassGMin: res.min,
      totalMassGMax: res.max,
      steps: link.child.steps,
      allergens: collectAllergens(link.child).map((a) => a.label),
      coef: res.effectiveCoef,
    };
  });

  if (massTarget?.exact) {
    // Ajuste toutes les préparations ensemble, en épargnant même les éléments
    // verrouillés au deuxième niveau. Les totaux stockés restent propres à chaque préparation.
    const groups = [ingredients, ...subRecipes.map((sr) => sr.ingredients)];
    const flags = [ingredients.map(() => false), ...subFixed];
    const free: AdjIngredient[] = [];
    let fixedMass = 0;
    groups.forEach((group, g) => group.forEach((ing, i) => {
      if (flags[g][i]) fixedMass += recipeMass([ing]).avg;
      else free.push(ing);
    }));
    const target = Math.max(0, massTarget.target - fixedMass);
    const adjusted = target === 0
      ? free.map((i) => ({ ...i, quantityG: 0, quantityGMax: i.quantityGMax == null ? null : 0 }))
      : adjustToTarget(free, target).ingredients;
    let idx = 0;
    groups.forEach((group, g) => group.forEach((_, i) => {
      if (!flags[g][i]) group[i] = adjusted[idx++];
    }));
    for (const sr of subRecipes) {
      const mass = recipeMass(sr.ingredients);
      sr.totalMassG = mass.avg;
      sr.totalMassGMin = mass.min;
      sr.totalMassGMax = mass.max;
    }
  }
  const { min: totalMassGMin, max: totalMassGMax, avg: totalMassG } = recipeMass(ingredients);
  if (massTarget?.exact && Math.abs(totalMassG + subRecipes.reduce((sum, sr) => sum + sr.totalMassG, 0) - massTarget.target) > 0.5) {
    throw new Error("Masse exacte impossible avec les unités et les ingrédients verrouillés actuels.");
  }

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
