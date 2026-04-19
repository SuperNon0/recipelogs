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
 */
export async function buildRecipeSnapshot(recipeId: number) {
  const r = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: {
      ingredients: {
        orderBy: { position: "asc" },
        include: { ingredientBase: true },
      },
      stepsBlock: true,
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

  const ingredients = r.ingredients.map((i) => ({
    name: i.name ?? i.ingredientBase?.name ?? "—",
    quantityG: Number(i.quantityG),
  }));
  const totalMassG = ingredients.reduce((s, i) => s + i.quantityG, 0);

  const subRecipes = r.parentLinks.map((link) => {
    const childIngredients = link.child.ingredients.map((i) => ({
      name: i.name ?? i.ingredientBase?.name ?? "—",
      quantityG: Number(i.quantityG),
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
    ingredients,
    steps: r.stepsBlock?.content ?? null,
    totalMassG,
    subRecipes,
  };
}

export type RecipeSnapshot = Awaited<ReturnType<typeof buildRecipeSnapshot>>;
