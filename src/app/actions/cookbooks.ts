"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildRecipeSnapshot } from "@/lib/cookbooks";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createCookbook(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const format = (String(formData.get("format") ?? "A4") === "A5"
    ? "A5"
    : "A4") as "A4" | "A5";

  if (!name) throw new Error("Le nom du cahier est obligatoire.");

  const template = await prisma.pdfTemplate.findUnique({
    where: { slug: "classique" },
  });

  const cookbook = await prisma.cookbook.create({
    data: {
      name: name.slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      format,
      templateId: template?.id ?? null,
    },
  });

  revalidatePath("/cookbooks");
  redirect(`/cookbooks/${cookbook.id}`);
}

export async function updateCookbookConfig(
  id: number,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const format = (String(formData.get("format") ?? "A4") === "A5"
    ? "A5"
    : "A4") as "A4" | "A5";
  const templateIdRaw = formData.get("templateId");
  const templateId = templateIdRaw ? Number(templateIdRaw) : null;
  const hasToc = formData.get("hasToc") === "on";
  const hasCover = formData.get("hasCover") === "on";
  const hasLogo = formData.get("hasLogo") === "on";
  const footer = String(formData.get("footer") ?? "").trim();

  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  await prisma.cookbook.update({
    where: { id },
    data: {
      name: name.slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      format,
      templateId,
      hasToc,
      hasCover,
      hasLogo,
      footer: footer ? footer.slice(0, 500) : null,
    },
  });

  revalidatePath(`/cookbooks/${id}`);
  revalidatePath("/cookbooks");
  return { ok: true };
}

export async function deleteCookbook(id: number) {
  await prisma.cookbook.delete({ where: { id } });
  revalidatePath("/cookbooks");
  redirect("/cookbooks");
}

export async function addRecipeToCookbook(
  cookbookId: number,
  recipeId: number,
  linkMode: "linked" | "snapshot",
  subrecipeMode: "single" | "separate",
  multiplier = 1,
): Promise<ActionResult> {
  const cookbook = await prisma.cookbook.findUnique({
    where: { id: cookbookId },
    select: { id: true },
  });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const maxPos = await prisma.cookbookRecipe.aggregate({
    where: { cookbookId },
    _max: { position: true },
  });

  let snapshotData = null;
  let snapshotDate: Date | null = null;
  if (linkMode === "snapshot") {
    const snap = await buildRecipeSnapshot(recipeId, multiplier);
    if (!snap) return { ok: false, error: "Recette introuvable." };
    snapshotData = snap;
    snapshotDate = new Date();
  }

  await prisma.cookbookRecipe.create({
    data: {
      cookbookId,
      recipeId,
      position: (maxPos._max.position ?? -1) + 1,
      linkMode,
      subrecipeMode,
      snapshotData: snapshotData
        ? (snapshotData as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      snapshotDate,
    },
  });

  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

export async function removeFromCookbook(entryId: number, cookbookId: number) {
  await prisma.cookbookRecipe.delete({ where: { id: entryId } });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

export async function moveCookbookEntry(
  entryId: number,
  direction: -1 | 1,
  cookbookId: number,
) {
  const entries = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const idx = entries.findIndex((e) => e.id === entryId);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= entries.length) return;

  const a = entries[idx];
  const b = entries[target];
  await prisma.$transaction([
    prisma.cookbookRecipe.update({
      where: { id: a.id },
      data: { position: b.position },
    }),
    prisma.cookbookRecipe.update({
      where: { id: b.id },
      data: { position: a.position },
    }),
  ]);
  revalidatePath(`/cookbooks/${cookbookId}`);
}

export async function refreshSnapshot(entryId: number, cookbookId: number) {
  const entry = await prisma.cookbookRecipe.findUnique({
    where: { id: entryId },
    select: { recipeId: true },
  });
  if (!entry) return;
  const snap = await buildRecipeSnapshot(entry.recipeId);
  if (!snap) return;
  await prisma.cookbookRecipe.update({
    where: { id: entryId },
    data: {
      linkMode: "snapshot",
      snapshotData: snap as unknown as Prisma.InputJsonValue,
      snapshotDate: new Date(),
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

export async function convertToLinked(entryId: number, cookbookId: number) {
  await prisma.cookbookRecipe.update({
    where: { id: entryId },
    data: {
      linkMode: "linked",
      snapshotData: Prisma.JsonNull,
      snapshotDate: null,
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}
