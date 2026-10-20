import { prisma } from "./prisma";
import { computeLocalCoef } from "./subRecipes";
import { scaleQty, adjustToTarget, recipeMass } from "./massAdjust";

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

  const subRecipes = r.parentLinks.map((link) => {
    // Masse de base de la sous-recette (quantités brutes non scalées)
    const rawIngredients = link.child.ingredients;
    // Même définition que la fiche recette : moyenne min/max des fourchettes.
    const childBaseTotalG = recipeMass(rawIngredients).avg;
    // Ingrédient pivot (pour le mode pivot_ingredient)
    const pivotBaseQtyG = link.pivotIngredientId
      ? Number(rawIngredients.find((i) => i.id === link.pivotIngredientId)?.quantityG ?? 0) || null
      : null;
    // Coefficient propre à la sous-recette (calcMode + calcValue définis lors de l'ajout)
    const localCoef = computeLocalCoef(
      link.calcMode,
      Number(link.calcValue),
      childBaseTotalG,
      pivotBaseQtyG,
    );
    // Si verrouillée : le coefficient parent ne s'applique pas
    const effectiveCoef = link.isLocked ? localCoef : localCoef * k;

    let childIngredients = rawIngredients.map((i) => {
      const unit = i.unit ?? "g";
      const scaled = scaleQty(Number(i.quantityG), unit, effectiveCoef);
      const scaledMax = i.quantityGMax != null ? scaleQty(Number(i.quantityGMax), unit, effectiveCoef) : null;
      return {
        name: i.name ?? i.ingredientBase?.name ?? "—",
        quantityG: scaled.quantityG,
        quantityGMax: scaledMax?.quantityG ?? null,
        unit: scaled.unit,
      };
    });
    if (link.isExact && link.calcMode === "mass_target") {
      const effectiveTargetG = link.isLocked ? Number(link.calcValue) : Number(link.calcValue) * k;
      childIngredients = adjustToTarget(childIngredients, effectiveTargetG).ingredients;
    }
    const { min: childTotalGMin, max: childTotalGMax } = recipeMass(childIngredients);
    return {
      label: link.label,
      childName: link.child.name,
      calcMode: link.calcMode,
      calcValue: Number(link.calcValue),
      isLocked: link.isLocked,
      isExact: link.isExact,
      ingredients: childIngredients,
      totalMassG: (childTotalGMin + childTotalGMax) / 2,
      totalMassGMin: childTotalGMin,
      totalMassGMax: childTotalGMax,
      steps: link.child.stepsBlock?.content ?? null,
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
    steps: r.stepsBlock?.content ?? null,
    totalMassG,
    totalMassGMin,
    totalMassGMax,
    subRecipes,
    multiplier: k,
  };
}

export type RecipeSnapshot = Awaited<ReturnType<typeof buildRecipeSnapshot>>;
