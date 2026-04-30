import { prisma } from "./prisma";

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
            },
          },
        },
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
  }));
  const totalMassG = ingredients.reduce((s, i) => s + i.quantityG, 0);

  const subRecipes = r.parentLinks.map((link) => {
    const childIngredients = link.child.ingredients.map((i) => ({
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: Number(i.quantityG) * k,
    }));
    const childTotalG = childIngredients.reduce(
      (s, i) => s + i.quantityG,
      0,
    );
    return {
      label: link.label,
      childName: link.child.name,
      calcMode: link.calcMode,
      calcValue: Number(link.calcValue),
      isLocked: link.isLocked,
      ingredients: childIngredients,
      totalMassG: childTotalG,
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
    subRecipes,
    multiplier: k,
  };
}

export type RecipeSnapshot = Awaited<ReturnType<typeof buildRecipeSnapshot>>;
