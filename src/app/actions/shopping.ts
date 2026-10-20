"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import { aggregateIngredients, shoppingKey } from "@/lib/shopping";
import { buildRecipeSnapshot } from "@/lib/cookbooks";


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

export async function addCookbookRecipesToList(
  cookbookId: number,
  targetListId: number | null,
  newListName: string | null,
): Promise<{ ok: true; listId: number } | { ok: false; error: string }> {
  const entries = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    select: { recipeId: true },
  });

  if (entries.length === 0) {
    return { ok: false, error: "Ce cahier ne contient aucune recette." };
  }

  let listId: number;

  if (targetListId) {
    const existing = await prisma.shoppingList.findUnique({ where: { id: targetListId } });
    if (!existing) return { ok: false, error: "Liste introuvable." };
    listId = targetListId;
  } else {
    const name = (newListName ?? "").trim();
    if (!name) return { ok: false, error: "Le nom de la liste est obligatoire." };
    const list = await prisma.shoppingList.create({
      data: { name: name.slice(0, 200) },
    });
    listId = list.id;
  }

  const recipeIds = [...new Set(entries.map((e) => e.recipeId))];

  for (const recipeId of recipeIds) {
    await prisma.shoppingListRecipe.upsert({
      where: { shoppingListId_recipeId: { shoppingListId: listId, recipeId } },
      create: { shoppingListId: listId, recipeId, coefficient: 1 },
      update: {},
    });
  }

  await regenerateItems(listId);
  revalidatePath(`/shopping/${listId}`);
  revalidatePath("/shopping");
  return { ok: true, listId };
}

// ─── Interne ─────────────────────────────────────────────────────────────────

async function regenerateItems(listId: number) {
  const listRecipes = await prisma.shoppingListRecipe.findMany({
    where: { shoppingListId: listId },
    select: { recipeId: true, coefficient: true },
  });

  // Le snapshot applique le coefficient avec les mêmes règles que la fiche
  // recette (arrondi, L → g, sous-recettes verrouillées ou non…) : la liste
  // contient donc aussi les ingrédients des sous-recettes.
  const sources = [];
  for (const r of listRecipes) {
    const snap = await buildRecipeSnapshot(r.recipeId, Number(r.coefficient));
    if (!snap) continue;
    sources.push({
      recipeId: r.recipeId,
      ingredients: [...snap.ingredients, ...snap.subRecipes.flatMap((sr) => sr.ingredients)],
    });
  }
  const aggregated = aggregateIngredients(sources);

  const previous = await prisma.shoppingListItem.findMany({
    where: { shoppingListId: listId },
    orderBy: { position: "asc" },
  });
  // Les cases déjà cochées le restent après régénération.
  const checkedKeys = new Set(
    previous.filter((i) => i.recipeId !== null && i.checked).map((i) => shoppingKey(i.name, i.unit)),
  );
  const manualItems = previous.filter((i) => i.recipeId === null);

  await prisma.$transaction([
    prisma.shoppingListItem.deleteMany({
      where: { shoppingListId: listId, recipeId: { not: null } },
    }),
    prisma.shoppingListItem.createMany({
      data: aggregated.map((ing, idx) => ({
        shoppingListId: listId,
        name: ing.name,
        quantityG: ing.quantityG && ing.quantityG > 0 ? ing.quantityG : null,
        unit: ing.unit,
        recipeId: ing.recipeId,
        checked: checkedKeys.has(shoppingKey(ing.name, ing.unit)),
        position: idx,
      })),
    }),
    // Les articles ajoutés à la main restent après les articles générés
    ...manualItems.map((item, idx) =>
      prisma.shoppingListItem.update({
        where: { id: item.id },
        data: { position: aggregated.length + idx },
      }),
    ),
  ]);
}
