"use server";

import { requireAccess } from "@/lib/auth/guard";
import { requireVisibleCookbook, requireVisibleRecipe } from "@/lib/auth/visibility";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import { buildRecipeSnapshot } from "@/lib/cookbooks";
import { resizeSnapshot, type MassSnapshot } from "@/lib/snapshotMass";
import { parseTheme, cookbookThemeSchema } from "@/lib/pdf/theme";


/**
 * Prochaine position libre dans un cahier. Recettes ET chapitres partagent
 * le même ordre : il faut regarder les deux tables, sinon une nouvelle
 * recette peut prendre la place d'un chapitre.
 */
async function nextCookbookPosition(cookbookId: number): Promise<number> {
  const [maxRecipe, maxChapter] = await Promise.all([
    prisma.cookbookRecipe.aggregate({ where: { cookbookId }, _max: { position: true } }),
    prisma.cookbookChapter.aggregate({ where: { cookbookId }, _max: { position: true } }),
  ]);
  return Math.max(maxRecipe._max.position ?? -1, maxChapter._max.position ?? -1) + 1;
}

export async function createCookbook(formData: FormData) {
  await requireAccess("cookbooks.edit");
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
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(id);
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const format = (String(formData.get("format") ?? "A4") === "A5"
    ? "A5"
    : "A4") as "A4" | "A5";
  const hasToc = formData.get("hasToc") === "on";
  const hasCover = formData.get("hasCover") === "on";
  const hasLogo = formData.get("hasLogo") === "on";
  const footer = String(formData.get("footer") ?? "").trim();

  if (!name) return { ok: false, error: "Le nom est obligatoire." };

  // Theme : JSON sérialisé depuis le client.
  const themeRaw = formData.get("theme");
  let themeData: Prisma.InputJsonValue | undefined;
  if (typeof themeRaw === "string" && themeRaw.length > 0) {
    try {
      const parsed = cookbookThemeSchema.safeParse(JSON.parse(themeRaw));
      if (parsed.success) {
        themeData = parsed.data as unknown as Prisma.InputJsonValue;
      } else {
        // En cas de payload invalide on retombe sur la version tolérante.
        themeData = parseTheme(JSON.parse(themeRaw)) as unknown as Prisma.InputJsonValue;
      }
    } catch {
      return { ok: false, error: "Configuration de thème invalide." };
    }
  }

  await prisma.cookbook.update({
    where: { id },
    data: {
      name: name.slice(0, 200),
      description: description ? description.slice(0, 2000) : null,
      format,
      hasToc,
      hasCover,
      hasLogo,
      footer: footer ? footer.slice(0, 500) : null,
      ...(themeData !== undefined ? { coverConfig: themeData } : {}),
    },
  });

  revalidatePath(`/cookbooks/${id}`);
  revalidatePath("/cookbooks");
  return { ok: true };
}

export async function deleteCookbook(id: number) {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(id);
  await prisma.cookbook.delete({ where: { id } });
  revalidatePath("/cookbooks");
  redirect("/cookbooks");
}

export async function addMultipleRecipesToCookbook(
  cookbookId: number,
  recipeIds: number[],
  linkMode: "linked" | "snapshot",
): Promise<ActionResult & { added?: number; skipped?: number }> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  for (const id of recipeIds) await requireVisibleRecipe(id);
  if (!recipeIds.length) return { ok: false, error: "Aucune recette sélectionnée." };

  const cookbook = await prisma.cookbook.findUnique({ where: { id: cookbookId }, select: { id: true } });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const existing = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    select: { recipeId: true },
  });
  const existingIds = new Set(existing.map((e) => e.recipeId));
  const firstPos = await nextCookbookPosition(cookbookId);

  const toAdd = recipeIds.filter((id) => !existingIds.has(id));
  const skipped = recipeIds.length - toAdd.length;
  if (toAdd.length === 0) return { ok: true, added: 0, skipped };

  if (linkMode === "linked") {
    await prisma.cookbookRecipe.createMany({
      data: toAdd.map((recipeId, idx) => ({
        cookbookId,
        recipeId,
        position: firstPos + idx,
        linkMode: "linked" as const,
        subrecipeMode: "single" as const,
        snapshotData: Prisma.JsonNull,
        snapshotDate: null,
      })),
    });
  } else {
    for (let i = 0; i < toAdd.length; i++) {
      const snap = await buildRecipeSnapshot(toAdd[i], 1);
      if (!snap) continue;
      await prisma.cookbookRecipe.create({
        data: {
          cookbookId,
          recipeId: toAdd[i],
          position: firstPos + i,
          linkMode: "snapshot",
          subrecipeMode: "single",
          snapshotData: snap as unknown as Prisma.InputJsonValue,
          snapshotDate: new Date(),
        },
      });
    }
  }

  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true, added: toAdd.length, skipped };
}

export async function addMultipleRecipesWithMassTarget(
  cookbookId: number,
  recipeIds: number[],
  targetMassG: number,
  forceExact = false,
): Promise<ActionResult & { added?: number; skipped?: number }> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  for (const id of recipeIds) await requireVisibleRecipe(id);
  if (!recipeIds.length) return { ok: false, error: "Aucune recette sélectionnée." };
  if (!Number.isFinite(targetMassG) || targetMassG <= 0)
    return { ok: false, error: "Masse cible invalide." };

  const cookbook = await prisma.cookbook.findUnique({ where: { id: cookbookId }, select: { id: true } });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const existing = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    select: { recipeId: true },
  });
  const existingIds = new Set(existing.map((e) => e.recipeId));
  const firstPos = await nextCookbookPosition(cookbookId);

  const toAdd = recipeIds.filter((id) => !existingIds.has(id));
  const skipped = recipeIds.length - toAdd.length;
  if (toAdd.length === 0) return { ok: true, added: 0, skipped };

  let added = 0;
  for (let i = 0; i < toAdd.length; i++) {
    let snap;
    try {
      snap = await buildRecipeSnapshot(toAdd[i], 1, { target: targetMassG, exact: forceExact });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Masse cible impossible." , added, skipped };
    }
    if (!snap) continue;

    await prisma.cookbookRecipe.create({
      data: {
        cookbookId,
        recipeId: toAdd[i],
        position: firstPos + i,
        linkMode: "snapshot",
        subrecipeMode: "single",
        snapshotData: snap as unknown as Prisma.InputJsonValue,
        snapshotDate: new Date(),
      },
    });
    added++;
  }

  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true, added, skipped };
}

export async function addRecipeToCookbook(
  cookbookId: number,
  recipeId: number,
  linkMode: "linked" | "snapshot",
  subrecipeMode: "single" | "separate",
  multiplier = 1,
  massTarget?: number,
): Promise<ActionResult> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  await requireVisibleRecipe(recipeId);
  const cookbook = await prisma.cookbook.findUnique({
    where: { id: cookbookId },
    select: { id: true },
  });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const position = await nextCookbookPosition(cookbookId);

  let snapshotData = null;
  let snapshotDate: Date | null = null;
  if (linkMode === "snapshot") {
    let snap;
    try {
      snap = await buildRecipeSnapshot(recipeId, multiplier, massTarget == null ? undefined : { target: massTarget });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Masse cible impossible." };
    }
    if (!snap) return { ok: false, error: "Recette introuvable." };
    snapshotData = snap;
    snapshotDate = new Date();
  }

  await prisma.cookbookRecipe.create({
    data: {
      cookbookId,
      recipeId,
      position,
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
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  await prisma.cookbookRecipe.delete({ where: { id: entryId, cookbookId } });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

export async function setSectionTitle(
  entryId: number,
  title: string,
  cookbookId: number,
) {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  const t = title.trim().slice(0, 200);
  await prisma.cookbookRecipe.update({
    where: { id: entryId, cookbookId },
    data: { sectionTitle: t || null },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

// ─── Chapitres ───────────────────────────────────────────────────────────────

export async function addChapter(
  cookbookId: number,
  data: { title: string; intro?: string },
): Promise<ActionResult> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  const title = data.title.trim();
  if (!title) return { ok: false, error: "Le titre du chapitre est obligatoire." };

  const position = await nextCookbookPosition(cookbookId);

  await prisma.cookbookChapter.create({
    data: {
      cookbookId,
      title: title.slice(0, 200),
      intro: data.intro?.trim().slice(0, 5000) || null,
      position,
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

export async function updateChapter(
  chapterId: number,
  data: { title: string; intro?: string },
  cookbookId: number,
): Promise<ActionResult> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  const title = data.title.trim();
  if (!title) return { ok: false, error: "Le titre du chapitre est obligatoire." };

  await prisma.cookbookChapter.update({
    where: { id: chapterId, cookbookId },
    data: {
      title: title.slice(0, 200),
      intro: data.intro?.trim().slice(0, 5000) || null,
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

export async function deleteChapter(chapterId: number, cookbookId: number) {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  await prisma.cookbookChapter.delete({ where: { id: chapterId, cookbookId } });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

// ─── Réorganisation unifiée (recettes + chapitres) ───────────────────────────

/**
 * Sauvegarde un nouvel ordre des entrées du cahier après un drag-and-drop.
 * `entries` : liste ordonnée d'entrées avec leur type ("recipe" ou "chapter") et id.
 * On réécrit la `position` séquentiellement (0..N-1) sur chaque table.
 */
export async function reorderCookbookEntries(
  cookbookId: number,
  entries: { type: "recipe" | "chapter"; id: number }[],
): Promise<ActionResult> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  // Vérifie que tout appartient bien au cahier
  const recipeIds = entries.filter((e) => e.type === "recipe").map((e) => e.id);
  const chapterIds = entries.filter((e) => e.type === "chapter").map((e) => e.id);

  const [recipes, chapters] = await Promise.all([
    prisma.cookbookRecipe.findMany({
      where: { id: { in: recipeIds }, cookbookId },
      select: { id: true },
    }),
    prisma.cookbookChapter.findMany({
      where: { id: { in: chapterIds }, cookbookId },
      select: { id: true },
    }),
  ]);

  if (recipes.length !== recipeIds.length || chapters.length !== chapterIds.length) {
    return { ok: false, error: "Une ou plusieurs entrées n'appartiennent pas à ce cahier." };
  }

  // Mise à jour atomique : la position de chaque entrée correspond à son index dans la liste
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === "recipe") {
      ops.push(
        prisma.cookbookRecipe.update({
          where: { id: e.id },
          data: { position: i },
        }),
      );
    } else {
      ops.push(
        prisma.cookbookChapter.update({
          where: { id: e.id },
          data: { position: i },
        }),
      );
    }
  }

  await prisma.$transaction(ops);
  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

export async function refreshSnapshot(entryId: number, cookbookId: number) {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  const entry = await prisma.cookbookRecipe.findUnique({
    where: { id: entryId, cookbookId },
    select: { recipeId: true, snapshotData: true },
  });
  if (!entry) return;
  // On garde le coefficient déjà appliqué (ex. recette figée à 800 g) au lieu
  // de revenir à la masse d'origine.
  const previous = entry.snapshotData as { multiplier?: number } | null;
  const multiplier = previous?.multiplier && previous.multiplier > 0 ? previous.multiplier : 1;
  const snap = await buildRecipeSnapshot(entry.recipeId, multiplier);
  if (!snap) return;
  await prisma.cookbookRecipe.update({
    where: { id: entryId, cookbookId },
    data: {
      linkMode: "snapshot",
      snapshotData: snap as unknown as Prisma.InputJsonValue,
      snapshotDate: new Date(),
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

export async function convertToLinked(entryId: number, cookbookId: number) {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  await prisma.cookbookRecipe.update({
    where: { id: entryId, cookbookId },
    data: {
      linkMode: "linked",
      snapshotData: Prisma.JsonNull,
      snapshotDate: null,
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

// ─── Modification de la masse d'une recette figée ────────────────────────────

export type UpdateSnapshotMassPayload =
  | { mode: "coefficient"; coefficient: number }
  | { mode: "mass_target"; targetMassG: number; forceExact?: boolean }
  | { mode: "pivot_ingredient"; pivotIndex: number; targetMassG: number };

/**
 * Recettes FIGÉES (📌 snapshot) uniquement : met les quantités libres à
 * l'échelle en conservant les ingrédients des sous-recettes verrouillées.
 *
 * Trois modes (identiques à la fiche recette) :
 *  - `coefficient`     : multiplicateur direct (ex : 1.5)
 *  - `mass_target`     : ratio = (cible − masse verrouillée) / masse libre
 *  - `pivot_ingredient`: on fixe la masse d'un ingrédient (ratio = cible / qté actuelle)
 */
export async function updateSnapshotMass(
  entryId: number,
  payload: UpdateSnapshotMassPayload,
  cookbookId: number,
): Promise<ActionResult> {
  await requireAccess("cookbooks.edit");
  await requireVisibleCookbook(cookbookId);
  const entry = await prisma.cookbookRecipe.findUnique({
    where: { id: entryId, cookbookId },
    select: { linkMode: true, snapshotData: true },
  });
  if (!entry) return { ok: false, error: "Entrée introuvable." };
  if (entry.linkMode !== "snapshot" || !entry.snapshotData) {
    return { ok: false, error: "Cette entrée n'est pas figée." };
  }

  let newSnap: MassSnapshot;
  try {
    newSnap = resizeSnapshot(entry.snapshotData as unknown as MassSnapshot, payload);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Masse invalide." };
  }

  await prisma.cookbookRecipe.update({
    where: { id: entryId, cookbookId },
    data: {
      snapshotData: newSnap as unknown as Prisma.InputJsonValue,
      snapshotDate: new Date(),
    },
  });

  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}
