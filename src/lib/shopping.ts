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

export type ShoppingSourceIngredient = {
  name: string;
  quantityG: number;
  quantityGMax?: number | null;
  unit?: string | null;
};

export type AggregatedItem = {
  name: string;
  /** null pour QS (pas de quantité). */
  quantityG: number | null;
  unit: string;
  recipeId: number;
};

/** Clé de fusion : même nom (sans casse) ET même unité. */
export function shoppingKey(name: string, unit: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${unit ?? "g"}`;
}

/**
 * Fusionne les ingrédients de plusieurs recettes (quantités déjà multipliées).
 * - On ne fusionne que des quantités de même unité (2 pièces + 100 g ≠ 102).
 * - Fourchette min/max : on retient le max (pour acheter assez).
 * - QS : une seule ligne, sans quantité.
 * - Lignes à 0 g (titres de section importés) : ignorées.
 */
export function aggregateIngredients(
  sources: { recipeId: number; ingredients: ShoppingSourceIngredient[] }[],
): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();

  for (const src of sources) {
    for (const ing of src.ingredients) {
      const name = (ing.name ?? "—").trim();
      const unit = ing.unit ?? "g";
      const key = shoppingKey(name, unit);
      const qty = unit === "QS" ? null : Number(ing.quantityGMax ?? ing.quantityG);
      // 0 g sans fourchette : titre de section importé (« Levain », « Pâte »…), rien à acheter.
      if (qty === 0) continue;
      const existing = map.get(key);
      if (existing) {
        if (existing.quantityG !== null && qty !== null) existing.quantityG += qty;
      } else {
        map.set(key, { name, quantityG: qty, unit, recipeId: src.recipeId });
      }
    }
  }

  return Array.from(map.values());
}
