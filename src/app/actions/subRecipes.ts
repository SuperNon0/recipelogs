"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasCycle } from "@/lib/subRecipes";

export type SubRecipeActionResult = { ok: true } | { ok: false; error: string };

export async function addSubRecipe(
  parentId: number,
  formData: FormData,
): Promise<SubRecipeActionResult> {
  const childId = Number(formData.get("childId"));
  const label = String(formData.get("label") ?? "").trim();
  const calcMode = String(formData.get("calcMode") ?? "coefficient") as
    | "coefficient"
    | "mass_target"
    | "pivot_ingredient";
  const calcValueRaw = Number(formData.get("calcValue"));
  const pivotIngredientIdRaw = formData.get("pivotIngredientId");
  const pivotIngredientId = pivotIngredientIdRaw
    ? Number(pivotIngredientIdRaw)
    : null;

  if (!Number.isFinite(childId) || childId <= 0) {
    return { ok: false, error: "Recette source invalide." };
  }
  if (!label) {
    return { ok: false, error: "Le label est obligatoire." };
  }
  if (!["coefficient", "mass_target", "pivot_ingredient"].includes(calcMode)) {
    return { ok: false, error: "Mode de calcul invalide." };
  }
  if (!Number.isFinite(calcValueRaw) || calcValueRaw <= 0) {
    return { ok: false, error: "La valeur doit être un nombre positif." };
  }
  if (calcMode === "pivot_ingredient" && !pivotIngredientId) {
    return { ok: false, error: "Sélectionnez un ingrédient pivot." };
  }

  if (await hasCycle(parentId, childId)) {
    return {
      ok: false,
      error: "Cycle détecté : impossible d'ajouter cette sous-recette.",
    };
  }

  const maxPos = await prisma.subRecipe.aggregate({
    where: { parentId },
    _max: { position: true },
  });

  await prisma.subRecipe.create({
    data: {
      parentId,
      childId,
      label: label.slice(0, 200),
      calcMode,
      calcValue: calcValueRaw,
      pivotIngredientId,
      position: (maxPos._max.position ?? -1) + 1,
    },
  });

  revalidatePath(`/recipes/${parentId}`);
  return { ok: true };
}

export async function updateSubRecipe(
  id: number,
  parentId: number,
  formData: FormData,
): Promise<SubRecipeActionResult> {
  const label = String(formData.get("label") ?? "").trim();
  const calcMode = String(formData.get("calcMode") ?? "coefficient") as
    | "coefficient"
    | "mass_target"
    | "pivot_ingredient";
  const calcValueRaw = Number(formData.get("calcValue"));
  const pivotIngredientIdRaw = formData.get("pivotIngredientId");
  const pivotIngredientId = pivotIngredientIdRaw
    ? Number(pivotIngredientIdRaw)
    : null;

  if (!label) return { ok: false, error: "Le label est obligatoire." };
  if (!Number.isFinite(calcValueRaw) || calcValueRaw <= 0) {
    return { ok: false, error: "Valeur invalide." };
  }
  if (calcMode === "pivot_ingredient" && !pivotIngredientId) {
    return { ok: false, error: "Sélectionnez un ingrédient pivot." };
  }

  await prisma.subRecipe.update({
    where: { id },
    data: {
      label: label.slice(0, 200),
      calcMode,
      calcValue: calcValueRaw,
      pivotIngredientId,
    },
  });
  revalidatePath(`/recipes/${parentId}`);
  return { ok: true };
}

export async function removeSubRecipe(id: number, parentId: number) {
  await prisma.subRecipe.delete({ where: { id } });
  revalidatePath(`/recipes/${parentId}`);
}

export async function toggleSubRecipeLock(id: number, parentId: number) {
  const current = await prisma.subRecipe.findUnique({
    where: { id },
    select: { isLocked: true },
  });
  if (!current) return;
  await prisma.subRecipe.update({
    where: { id },
    data: { isLocked: !current.isLocked },
  });
  revalidatePath(`/recipes/${parentId}`);
}
