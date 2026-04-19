"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { aggregateIngredients } from "@/lib/shopping";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createShoppingList(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Le nom est obligatoire.");

  const list = await prisma.shoppingList.create({
    data: { name: name.slice(0, 200) },
  });

  revalidatePath("/shopping");
  redirect(`/shopping/${list.id}`);
}

export async function deleteShoppingList(id: number) {
  await prisma.shoppingList.delete({ where: { id } });
  revalidatePath("/shopping");
  redirect("/shopping");
}

export async function addRecipeToList(
  listId: number,
  recipeId: number,
  coefficient: number,
): Promise<ActionResult> {
  if (coefficient <= 0) return { ok: false, error: "Le coefficient doit être positif." };

  await prisma.shoppingListRecipe.upsert({
    where: { shoppingListId_recipeId: { shoppingListId: listId, recipeId } },
    create: { shoppingListId: listId, recipeId, coefficient },
    update: { coefficient },
  });

  await regenerateItems(listId);
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function removeRecipeFromList(
  listId: number,
  recipeId: number,
): Promise<ActionResult> {
  await prisma.shoppingListRecipe.deleteMany({
    where: { shoppingListId: listId, recipeId },
  });

  await regenerateItems(listId);
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function addManualItem(
  listId: number,
  name: string,
  quantityG: number | null,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Le nom est obligatoire." };

  const maxPos = await prisma.shoppingListItem.aggregate({
    where: { shoppingListId: listId },
    _max: { position: true },
  });

  await prisma.shoppingListItem.create({
    data: {
      shoppingListId: listId,
      name: trimmed,
      quantityG: quantityG ?? null,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function toggleItem(itemId: number, listId: number): Promise<ActionResult> {
  const item = await prisma.shoppingListItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Item introuvable." };

  await prisma.shoppingListItem.update({
    where: { id: itemId },
    data: { checked: !item.checked },
  });

  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function removeItem(itemId: number, listId: number): Promise<ActionResult> {
  await prisma.shoppingListItem.delete({ where: { id: itemId } });
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function uncheckAll(listId: number): Promise<ActionResult> {
  await prisma.shoppingListItem.updateMany({
    where: { shoppingListId: listId },
    data: { checked: false },
  });
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

export async function removeChecked(listId: number): Promise<ActionResult> {
  await prisma.shoppingListItem.deleteMany({
    where: { shoppingListId: listId, checked: true },
  });
  revalidatePath(`/shopping/${listId}`);
  return { ok: true };
}

// ─── Interne ─────────────────────────────────────────────────────────────────

async function regenerateItems(listId: number) {
  const listRecipes = await prisma.shoppingListRecipe.findMany({
    where: { shoppingListId: listId },
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
  });

  const aggregated = aggregateIngredients(
    listRecipes.map((r) => ({ coefficient: Number(r.coefficient), recipe: r.recipe })),
  );

  // Conserver les items manuels (sans recipeId)
  const manualItems = await prisma.shoppingListItem.findMany({
    where: { shoppingListId: listId, recipeId: null },
    orderBy: { position: "asc" },
  });

  await prisma.$transaction([
    // Supprimer tous les items générés depuis les recettes
    prisma.shoppingListItem.deleteMany({
      where: { shoppingListId: listId, recipeId: { not: null } },
    }),
    // Réinsérer les agrégés
    ...aggregated.map((ing, idx) =>
      prisma.shoppingListItem.create({
        data: {
          shoppingListId: listId,
          name: ing.name,
          quantityG: ing.quantityG > 0 ? ing.quantityG : null,
          recipeId: ing.recipeId,
          position: idx,
        },
      }),
    ),
    // Repositionner les items manuels après
    ...manualItems.map((item, idx) =>
      prisma.shoppingListItem.update({
        where: { id: item.id },
        data: { position: aggregated.length + idx },
      }),
    ),
  ]);
}
