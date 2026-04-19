"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export type ActionResult = { ok: true } | { ok: false; error: string };

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
