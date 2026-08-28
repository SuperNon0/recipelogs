"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { hasCycle } from "@/lib/subRecipes";

export type SubRecipeActionResult = { ok: true } | { ok: false; error: string };

/**
 * Lit le pivot depuis le FormData. On stocke désormais le NOM de l'ingrédient
 * pivot (`pivotIngredientName`), plus robuste : les IDs deviennent orphelins
 * dès que la recette enfant est éditée (delete/create des ingrédients).
 * `pivotIngredientId` reste temporairement accepté pour compat.
 */
function readPivot(
  formData: FormData,
  calcMode: string,
): { name: string | null; legacyId: number | null } {
  const nameRaw = formData.get("pivotIngredientName");
  const name =
    typeof nameRaw === "string" && nameRaw.trim()
      ? nameRaw.trim().slice(0, 200)
      : null;

  const legacyIdRaw = formData.get("pivotIngredientId");
  const legacyId =
    legacyIdRaw && Number.isFinite(Number(legacyIdRaw))
      ? Number(legacyIdRaw)
      : null;

  if (calcMode !== "pivot_ingredient") return { name: null, legacyId: null };
  return { name, legacyId };
}

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
  const { name: pivotIngredientName, legacyId: pivotIngredientId } = readPivot(
    formData,
    calcMode,
  );

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
  if (calcMode === "pivot_ingredient" && !pivotIngredientName) {
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
      pivotIngredientName,
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
  const { name: pivotIngredientName, legacyId: pivotIngredientId } = readPivot(
    formData,
    calcMode,
  );

  if (!label) return { ok: false, error: "Le label est obligatoire." };
  if (!Number.isFinite(calcValueRaw) || calcValueRaw <= 0) {
    return { ok: false, error: "Valeur invalide." };
  }
  if (calcMode === "pivot_ingredient" && !pivotIngredientName) {
    return { ok: false, error: "Sélectionnez un ingrédient pivot." };
  }

  await prisma.subRecipe.update({
    where: { id },
    data: {
      label: label.slice(0, 200),
      calcMode,
      calcValue: calcValueRaw,
      pivotIngredientId,
      pivotIngredientName,
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
