import { prisma } from "./prisma";
import { computeLocalCoef } from "./subRecipes";

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

export async function listPdfTemplates() {
  return prisma.pdfTemplate.findMany({ orderBy: { id: "asc" } });
}

/**
 * Snapshot complet d'une recette (une passe, sans récursion profonde),
 * utilisé pour les entrées 📌 figées dans les cahiers.
 *
 * @param multiplier coefficient appliqué à toutes les quantités (1 = inchangé).
 *                   Permet de figer une version multipliée de la recette.
 */
function ingMass(q: number, unit: string): number {
  if (!unit || unit === "g") return q;
  if (unit === "cc") return q * 5;
  if (unit === "cs") return q * 15;
  if (unit === "L") return q * 1000;
  return 0;
}

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

  const ingredients = r.ingredients.map((i) => ({
    name: i.name ?? i.ingredientBase?.name ?? "—",
    quantityG: Number(i.quantityG) * k,
    quantityGMax: i.quantityGMax != null ? Number(i.quantityGMax) * k : null,
    unit: i.unit ?? "g",
  }));
  const totalMassGMin = ingredients.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
  const totalMassGMax = ingredients.reduce(
    (s, i) => s + ingMass(i.quantityGMax != null ? i.quantityGMax : i.quantityG, i.unit), 0,
  );
  const totalMassG = (totalMassGMin + totalMassGMax) / 2;

  const subRecipes = r.parentLinks.map((link) => {
    // Masse de base de la sous-recette (quantités brutes non scalées)
    const rawIngredients = link.child.ingredients;
    const childBaseTotalG = rawIngredients.reduce(
      (s, i) => s + ingMass(Number(i.quantityG), i.unit ?? "g"), 0,
    );
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

    const childIngredients = rawIngredients.map((i) => ({
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: Math.ceil(Number(i.quantityG) * effectiveCoef),
      quantityGMax: i.quantityGMax != null ? Math.ceil(Number(i.quantityGMax) * effectiveCoef) : null,
      unit: i.unit ?? "g",
    }));
    const childTotalGMin = childIngredients.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
    const childTotalGMax = childIngredients.reduce(
      (s, i) => s + ingMass(i.quantityGMax != null ? i.quantityGMax : i.quantityG, i.unit), 0,
    );
    return {
      label: link.label,
      childName: link.child.name,
      calcMode: link.calcMode,
      calcValue: Number(link.calcValue),
      isLocked: link.isLocked,
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
