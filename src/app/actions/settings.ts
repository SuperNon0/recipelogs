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
