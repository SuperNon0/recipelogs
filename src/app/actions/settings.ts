"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  recipePdfSettingsSchema,
  parseRecipePdfSettings,
  DEFAULT_RECIPE_PDF_SETTINGS,
  type RecipePdfSettings,
} from "@/lib/pdf/theme";

export type ActionResult = { ok: true } | { ok: false; error: string };

const RECIPE_PDF_KEY = "recipePdfSettings";

export async function getRecipePdfSettings(): Promise<RecipePdfSettings> {
  const row = await prisma.setting.findUnique({ where: { key: RECIPE_PDF_KEY } });
  if (!row) return DEFAULT_RECIPE_PDF_SETTINGS;
  return parseRecipePdfSettings(row.value);
}

export async function saveRecipePdfSettings(
  raw: unknown,
): Promise<ActionResult> {
  const parsed = recipePdfSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Réglages invalides." };
  }
  const value = parsed.data as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({
    where: { key: RECIPE_PDF_KEY },
    update: { value },
    create: { key: RECIPE_PDF_KEY, value },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#888888").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const exists = await prisma.category.findFirst({ where: { name } });
  if (exists) return { ok: false, error: "Cette catégorie existe déjà." };

  await prisma.category.create({ data: { name: name.slice(0, 100), color } });
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateCategory(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#888888").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  await prisma.category.update({
    where: { id },
    data: { name: name.slice(0, 100), color },
  });
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  await prisma.category.delete({ where: { id } });
  revalidatePath("/settings");
  return { ok: true };
}

// ─── Dossiers ───────────────────────────────────────────────────────────────

export async function createFolder(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#888888").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const exists = await prisma.folder.findFirst({ where: { name } });
  if (exists) return { ok: false, error: "Ce dossier existe déjà." };

  await prisma.folder.create({ data: { name: name.slice(0, 100), color } });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function updateFolder(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#888888").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  await prisma.folder.update({
    where: { id },
    data: { name: name.slice(0, 100), color },
  });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteFolder(id: number): Promise<ActionResult> {
  // ON DELETE SET NULL : les recettes du dossier passent en « Sans dossier »,
  // elles ne sont pas supprimées.
  await prisma.folder.delete({ where: { id } });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

// ─── Base d'ingrédients ──────────────────────────────────────────────────────

export async function renameIngredientBase(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const exists = await prisma.ingredientBase.findFirst({
    where: { name, NOT: { id } },
  });
  if (exists) return { ok: false, error: "Cet ingrédient existe déjà." };

  await prisma.ingredientBase.update({
    where: { id },
    data: { name: name.slice(0, 200) },
  });
  revalidatePath("/settings/ingredients");
  return { ok: true };
}

export async function deleteIngredientBase(id: number): Promise<ActionResult> {
  // ON DELETE SET NULL : les ingrédients des recettes gardent leur name,
  // seul le lien vers la base est supprimé.
  await prisma.ingredientBase.delete({ where: { id } });
  revalidatePath("/settings/ingredients");
  return { ok: true };
}

// ─── Lien externe du logo ────────────────────────────────────────────────────

const SITE_URL_KEY = "siteUrl";

export async function getSiteUrl(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SITE_URL_KEY } });
  if (!row || typeof row.value !== "string") return null;
  return row.value || null;
}

export async function saveSiteUrl(formData: FormData): Promise<ActionResult> {
  const url = String(formData.get("siteUrl") ?? "").trim();
  await prisma.setting.upsert({
    where: { key: SITE_URL_KEY },
    update: { value: url },
    create: { key: SITE_URL_KEY, value: url },
  });
  revalidatePath("/settings");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Range plusieurs recettes dans un dossier en une seule transaction.
 * Si folderId = null, les recettes passent en « Sans dossier ».
 */
export async function assignRecipesToFolder(
  folderId: number | null,
  recipeIds: number[],
): Promise<ActionResult & { count?: number }> {
  const ids = recipeIds
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    return { ok: false, error: "Aucune recette sélectionnée." };
  }
  if (folderId !== null) {
    const exists = await prisma.folder.findUnique({
      where: { id: folderId },
      select: { id: true },
    });
    if (!exists) return { ok: false, error: "Dossier introuvable." };
  }

  const result = await prisma.recipe.updateMany({
    where: { id: { in: ids } },
    data: { folderId },
  });

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, count: result.count };
}
