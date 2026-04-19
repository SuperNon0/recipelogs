import { prisma } from "./prisma";

export async function listShoppingLists() {
  return prisma.shoppingList.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { items: true } },
      recipes: {
        include: { recipe: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function getShoppingListDetail(id: number) {
  return prisma.shoppingList.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      recipes: {
        include: {
          recipe: {
            select: {
              id: true,
              name: true,
              ingredients: {
                orderBy: { position: "asc" },
                include: { ingredientBase: true },
              },
            },
          },
        },
      },
    },
  });
}

export async function listRecipesMinimalForShopping() {
  return prisma.recipe.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** Agrège les ingrédients des recettes liées à une liste, en appliquant les coefficients. */
export function aggregateIngredients(
  recipes: {
    coefficient: number;
    recipe: {
      id: number;
      name: string;
      ingredients: { name: string | null; quantityG: unknown; ingredientBase: { name: string } | null }[];
    };
  }[],
): { name: string; quantityG: number; recipeId: number }[] {
  const map = new Map<string, { name: string; quantityG: number; recipeId: number }>();

  for (const r of recipes) {
    const coef = Number(r.coefficient);
    for (const ing of r.recipe.ingredients) {
      const name = (ing.name ?? ing.ingredientBase?.name ?? "—").trim();
      const qty = Number(ing.quantityG) * coef;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.quantityG += qty;
      } else {
        map.set(key, { name, quantityG: qty, recipeId: r.recipe.id });
      }
    }
  }

  return Array.from(map.values());
}
