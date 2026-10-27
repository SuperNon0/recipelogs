import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeForSearch } from "./recipes";

/**
 * Copie complète d'une recette sous un autre nom (ingrédients, étapes, rendement,
 * moule, catégories, étiquettes, sous-recettes avec leurs réglages).
 * Sert à « Dupliquer » et à « Nouvelle variante ». Renvoie l'id de la copie.
 */
export async function copyRecipe(id: number, name: string): Promise<number> {
  const source = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: true,
      tags: true,
      categories: true,
      stepsBlock: true,
      parentLinks: true,
    },
  });
  if (!source) throw new Error("Recette introuvable");

  const copy = await prisma.recipe.create({
    data: {
      name,
      nameNormalized: normalizeForSearch(name),
      folderId: source.folderId,
      yieldCount: source.yieldCount,
      yieldLabel: source.yieldLabel,
      saleCoef: source.saleCoef,
      mold: source.mold ?? Prisma.DbNull,
      source: source.source,
      notesTips: source.notesTips,
      favorite: false,
      rating: source.rating,
      ingredients: {
        create: source.ingredients.map((ing) => ({
          name: ing.name,
          ingredientBaseId: ing.ingredientBaseId,
          quantityG: ing.quantityG,
          quantityGMax: ing.quantityGMax ?? null,
          unit: ing.unit,
          position: ing.position,
        })),
      },
      tags: { create: source.tags.map((t) => ({ name: t.name })) },
      categories: {
        create: source.categories.map((c) => ({ categoryId: c.categoryId })),
      },
      stepsBlock: source.stepsBlock
        ? { create: { content: source.stepsBlock.content } }
        : undefined,
      // Les sous-recettes sont reprises avec leurs réglages. L'ingrédient pivot
      // appartient à la sous-recette (pas à la copie) : l'identifiant reste valable.
      parentLinks: {
        create: source.parentLinks.map((l) => ({
          childId: l.childId,
          label: l.label,
          calcMode: l.calcMode,
          calcValue: l.calcValue,
          pivotIngredientId: l.pivotIngredientId,
          isLocked: l.isLocked,
          isExact: l.isExact,
          position: l.position,
        })),
      },
    },
  });
  return copy.id;
}
