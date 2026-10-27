import { prisma } from "./prisma";
import { scaleQty, recipeMass } from "./massAdjust";
import { resolveLink } from "./recipeTree";
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
  const r = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: {
        orderBy: { position: "asc" },
        include: { ingredientBase: true },
      },
      stepsBlock: true,
      tags: { orderBy: { name: "asc" } },
      categories: { include: { category: true } },
      parentLinks: {
        orderBy: { position: "asc" },
        include: {
          child: {
            include: {
              ingredients: {
                orderBy: { position: "asc" },
                include: { ingredientBase: true },
              },
              stepsBlock: true,
            },
          },
        },
      },
    },
  });
  if (!r) return null;

  const k = multiplier > 0 ? multiplier : 1;

  const ingredients = r.ingredients.map((i) => {
    const unit = i.unit ?? "g";
    const scaled = scaleQty(Number(i.quantityG), unit, k);
    const scaledMax = i.quantityGMax != null ? scaleQty(Number(i.quantityGMax), unit, k) : null;
    return {
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: scaled.quantityG,
      quantityGMax: scaledMax?.quantityG ?? null,
      unit: scaled.unit,
    };
  });
  const { min: totalMassGMin, max: totalMassGMax, avg: totalMassG } = recipeMass(ingredients);

  // Chaque sous-recette est résolue sur son arbre complet (sous-recettes
  // imbriquées comprises) : plus rien n'est oublié au-delà du 1er niveau.
  const subRecipes = await Promise.all(
    r.parentLinks.map(async (link) => {
      const childTree = await loadRecipeTree(link.childId);
      const res = childTree
        ? resolveLink(
            {
              calcMode: link.calcMode,
              calcValue: Number(link.calcValue),
              pivotIngredientId: link.pivotIngredientId,
              isLocked: link.isLocked,
              isExact: link.isExact,
              child: childTree,
            },
            k,
          )
        : { effectiveCoef: 1, ingredients: [], min: 0, max: 0 };
      return {
        label: link.label,
        childName: link.child.name,
        calcMode: link.calcMode,
        calcValue: Number(link.calcValue),
        isLocked: link.isLocked,
        isExact: link.isExact,
        ingredients: res.ingredients,
        totalMassG: (res.min + res.max) / 2,
        totalMassGMin: res.min,
        totalMassGMax: res.max,
        steps: link.child.stepsBlock?.content ?? null,
      };
    }),
  );

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
    steps: r.stepsBlock?.content ?? null,
    totalMassG,
    totalMassGMin,
    totalMassGMax,
    subRecipes,
    multiplier: k,
  };
}

export type RecipeSnapshot = Awaited<ReturnType<typeof buildRecipeSnapshot>>;
