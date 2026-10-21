"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import { ensureIngredientBases } from "@/lib/ingredientBases";
import {
  recipePdfSettingsSchema,
  parseRecipePdfSettings,
  DEFAULT_RECIPE_PDF_SETTINGS,
  type RecipePdfSettings,
} from "@/lib/pdf/theme";


/** Couleur saisie, limitée au format hexadécimal (#abc ou #aabbcc). */
function parseColor(raw: FormDataEntryValue | null): string {
  const c = String(raw ?? "").trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c : "#888888";
}

/** Vrai si l'erreur Prisma vient d'une contrainte d'unicité (nom déjà pris). */
function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Fait pointer vers la base `toId` tous les ingrédients de recette liés à
 * `fromId` OU portant le nom `fromName` (sans casse), et leur donne le nom `toName`.
 * Sert au renommage, à la mise en majuscule et à la fusion.
 */
async function relinkIngredients(
  tx: Prisma.TransactionClient,
  fromId: number,
  fromName: string,
  toId: number,
  toName: string,
) {
  await tx.ingredient.updateMany({
    where: { ingredientBaseId: fromId },
    data: { ingredientBaseId: toId, name: toName },
  });
  await tx.$executeRaw`
    UPDATE ingredients
    SET name = ${toName}, ingredient_base_id = ${toId}
    WHERE LOWER(name) = LOWER(${fromName}) AND ingredient_base_id IS NULL
  `;
}

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
  const color = parseColor(formData.get("color"));
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const exists = await prisma.category.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exists) return { ok: false, error: "Cette catégorie existe déjà." };

  await prisma.category.create({ data: { name: name.slice(0, 100), color } });
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Création rapide depuis le formulaire de recette : renvoie la catégorie
 * (existante si le nom est déjà pris) pour la cocher directement.
 */
export async function createCategoryInline(
  name: string,
  color: string,
): Promise<{ ok: true; category: { id: number; name: string; color: string } } | { ok: false; error: string }> {
  const clean = name.trim().slice(0, 100);
  if (!clean) return { ok: false, error: "Le nom est obligatoire." };
  const select = { id: true, name: true, color: true } as const;
  const exists = await prisma.category.findFirst({
    where: { name: { equals: clean, mode: "insensitive" } },
    select,
  });
  if (exists) return { ok: true, category: exists };
  const category = await prisma.category.create({
    data: { name: clean, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#888888" },
    select,
  });
  revalidatePath("/settings");
  return { ok: true, category };
}

export async function updateCategory(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const color = parseColor(formData.get("color"));
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  try {
    await prisma.category.update({
      where: { id },
      data: { name: name.slice(0, 100), color },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Cette catégorie existe déjà." };
    throw e;
  }
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
  const color = parseColor(formData.get("color"));
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const exists = await prisma.folder.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
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
  const color = parseColor(formData.get("color"));
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  try {
    await prisma.folder.update({
      where: { id },
      data: { name: name.slice(0, 100), color },
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Ce dossier existe déjà." };
    throw e;
  }
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

export async function capitalizeIngredientBase(id: number): Promise<ActionResult> {
  const current = await prisma.ingredientBase.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Ingrédient introuvable." };

  const newName = current.name.charAt(0).toUpperCase() + current.name.slice(1);
  if (newName === current.name) return { ok: true };

  const exists = await prisma.ingredientBase.findFirst({ where: { name: newName, NOT: { id } } });
  if (exists) return { ok: false, error: "Cet ingrédient existe déjà avec cette casse." };

  await prisma.$transaction(async (tx) => {
    await tx.ingredientBase.update({ where: { id }, data: { name: newName } });
    await relinkIngredients(tx, id, current.name, id, newName);
  });

  revalidatePath("/settings/ingredients");
  revalidatePath("/");
  return { ok: true };
}

export async function renameIngredientBase(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  const current = await prisma.ingredientBase.findUnique({ where: { id } });
  if (!current) return { ok: false, error: "Ingrédient introuvable." };

  const exists = await prisma.ingredientBase.findFirst({
    where: { name, NOT: { id } },
  });
  if (exists) return { ok: false, error: "Cet ingrédient existe déjà." };

  const newName = name.slice(0, 200);
  const oldName = current.name;

  await prisma.$transaction(async (tx) => {
    await tx.ingredientBase.update({ where: { id }, data: { name: newName } });
    await relinkIngredients(tx, id, oldName, id, newName);
  });

  revalidatePath("/settings/ingredients");
  revalidatePath("/");
  return { ok: true };
}

export async function mergeIngredientBases(
  sourceId: number,
  targetId: number,
): Promise<ActionResult> {
  if (sourceId === targetId) return { ok: false, error: "Impossible de fusionner un ingrédient avec lui-même." };

  const [source, target] = await Promise.all([
    prisma.ingredientBase.findUnique({ where: { id: sourceId } }),
    prisma.ingredientBase.findUnique({ where: { id: targetId } }),
  ]);
  if (!source || !target) return { ok: false, error: "Ingrédient introuvable." };

  await prisma.$transaction(async (tx) => {
    await relinkIngredients(tx, sourceId, source.name, targetId, target.name);
    await tx.ingredientBase.delete({ where: { id: sourceId } });
  });

  revalidatePath("/settings/ingredients");
  revalidatePath("/");
  return { ok: true };
}

export async function setIngredientCategory(
  id: number,
  category: "base" | "fruit" | "preparation" | null,
): Promise<ActionResult> {
  const exists = await prisma.ingredientBase.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return { ok: false, error: "Ingrédient introuvable." };
  await prisma.ingredientBase.update({ where: { id }, data: { category } });
  revalidatePath("/settings/ingredients");
  return { ok: true };
}

export async function setIngredientCategoryBulk(
  ids: number[],
  category: "base" | "fruit" | "preparation" | null,
): Promise<ActionResult & { count?: number }> {
  if (ids.length === 0) return { ok: false, error: "Aucun ingrédient sélectionné." };
  const { count } = await prisma.ingredientBase.updateMany({
    where: { id: { in: ids } },
    data: { category },
  });
  revalidatePath("/settings/ingredients");
  return { ok: true, count };
}

/**
 * Suppression en lot d'ingrédients de la base (sélection multiple).
 * ON DELETE SET NULL : les ingrédients des recettes gardent leur name,
 * seul le lien vers la base est retiré.
 */
export async function deleteIngredientBasesBulk(
  ids: number[],
): Promise<ActionResult & { count?: number }> {
  const cleanIds = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  if (cleanIds.length === 0) return { ok: false, error: "Aucun ingrédient sélectionné." };
  const { count } = await prisma.ingredientBase.deleteMany({
    where: { id: { in: cleanIds } },
  });
  revalidatePath("/settings/ingredients");
  revalidatePath("/");
  return { ok: true, count };
}

/**
 * Fusion en lot : réassigne plusieurs ingrédients sources vers une seule
 * cible, puis supprime les sources. La cible est ignorée si elle figure
 * dans la liste des sources.
 */
export async function mergeIngredientBasesBulk(
  sourceIds: number[],
  targetId: number,
): Promise<ActionResult & { count?: number }> {
  const sources = [...new Set(sourceIds)].filter(
    (n) => Number.isFinite(n) && n > 0 && n !== targetId,
  );
  if (sources.length === 0) return { ok: false, error: "Aucun ingrédient à fusionner." };

  const target = await prisma.ingredientBase.findUnique({ where: { id: targetId } });
  if (!target) return { ok: false, error: "Ingrédient cible introuvable." };

  const sourceRows = await prisma.ingredientBase.findMany({
    where: { id: { in: sources } },
    select: { id: true, name: true },
  });

  await prisma.$transaction(async (tx) => {
    for (const src of sourceRows) {
      await relinkIngredients(tx, src.id, src.name, targetId, target.name);
    }
    await tx.ingredientBase.deleteMany({ where: { id: { in: sourceRows.map((s) => s.id) } } });
  });

  revalidatePath("/settings/ingredients");
  revalidatePath("/");
  return { ok: true, count: sourceRows.length };
}

export async function deleteIngredientBase(id: number): Promise<ActionResult> {
  // ON DELETE SET NULL : les ingrédients des recettes gardent leur name,
  // seul le lien vers la base est supprimé.
  await prisma.ingredientBase.delete({ where: { id } });
  revalidatePath("/settings/ingredients");
  return { ok: true };
}

export async function syncAllIngredientBases(): Promise<ActionResult & { created?: number }> {
  const rows = await prisma.ingredient.findMany({
    where: { name: { not: null } },
    select: { name: true },
    distinct: ["name"],
  });
  const created = await ensureIngredientBases(rows.map((r) => r.name!));
  revalidatePath("/settings/ingredients");
  return { ok: true, created };
}

// ─── Lien externe du logo ────────────────────────────────────────────────────

const SITE_URL_KEY = "siteUrl";

export async function getSiteUrl(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SITE_URL_KEY } });
  if (!row || typeof row.value !== "string") return null;
  return row.value || null;
}

export async function saveSiteUrl(formData: FormData): Promise<void> {
  const url = String(formData.get("siteUrl") ?? "").trim();
  await prisma.setting.upsert({
    where: { key: SITE_URL_KEY },
    update: { value: url },
    create: { key: SITE_URL_KEY, value: url },
  });
  revalidatePath("/settings");
  revalidatePath("/");
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
