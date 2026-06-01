"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildRecipeSnapshot, adjustSnapshotToTarget } from "@/lib/cookbooks";
import { adjustToTarget, ingMass } from "@/lib/massAdjust";
import { parseTheme, cookbookThemeSchema } from "@/lib/pdf/theme";

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
  await prisma.cookbook.delete({ where: { id } });
  revalidatePath("/cookbooks");
  redirect("/cookbooks");
}

export async function addMultipleRecipesToCookbook(
  cookbookId: number,
  recipeIds: number[],
  linkMode: "linked" | "snapshot",
): Promise<ActionResult & { added?: number; skipped?: number }> {
  if (!recipeIds.length) return { ok: false, error: "Aucune recette sélectionnée." };

  const cookbook = await prisma.cookbook.findUnique({ where: { id: cookbookId }, select: { id: true } });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const existing = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    select: { recipeId: true, position: true },
  });
  const existingIds = new Set(existing.map((e) => e.recipeId));
  const maxPos = existing.reduce((m, e) => Math.max(m, e.position), -1);

  const toAdd = recipeIds.filter((id) => !existingIds.has(id));
  const skipped = recipeIds.length - toAdd.length;
  if (toAdd.length === 0) return { ok: true, added: 0, skipped };

  if (linkMode === "linked") {
    await prisma.cookbookRecipe.createMany({
      data: toAdd.map((recipeId, idx) => ({
        cookbookId,
        recipeId,
        position: maxPos + 1 + idx,
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
          position: maxPos + 1 + i,
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
  if (!recipeIds.length) return { ok: false, error: "Aucune recette sélectionnée." };
  if (!Number.isFinite(targetMassG) || targetMassG <= 0)
    return { ok: false, error: "Masse cible invalide." };

  const cookbook = await prisma.cookbook.findUnique({ where: { id: cookbookId }, select: { id: true } });
  if (!cookbook) return { ok: false, error: "Cahier introuvable." };

  const existing = await prisma.cookbookRecipe.findMany({
    where: { cookbookId },
    select: { recipeId: true, position: true },
  });
  const existingIds = new Set(existing.map((e) => e.recipeId));
  const maxPos = existing.reduce((m, e) => Math.max(m, e.position), -1);

  const toAdd = recipeIds.filter((id) => !existingIds.has(id));
  const skipped = recipeIds.length - toAdd.length;
  if (toAdd.length === 0) return { ok: true, added: 0, skipped };

  let added = 0;
  for (let i = 0; i < toAdd.length; i++) {
    const r = await prisma.recipe.findUnique({
      where: { id: toAdd[i] },
      select: { ingredients: { select: { quantityG: true, quantityGMax: true, unit: true } } },
    });
    if (!r) continue;

    // Masse totale de base de la recette
    const baseTotalG = r.ingredients.reduce((sum, ing) => {
      const q = ing.quantityGMax != null
        ? (Number(ing.quantityG) + Number(ing.quantityGMax)) / 2
        : Number(ing.quantityG);
      const u = ing.unit ?? "g";
      if (!u || u === "g") return sum + q;
      if (u === "cc") return sum + q * 5;
      if (u === "cs") return sum + q * 15;
      if (u === "L") return sum + q * 1000;
      return sum;
    }, 0);

    const multiplier = baseTotalG > 0 ? targetMassG / baseTotalG : 1;
    let snap = await buildRecipeSnapshot(toAdd[i], multiplier);
    if (!snap) continue;

    // Si forceExact : ajuster les ingrédients pour atteindre exactement la cible
    if (forceExact) {
      const { ingredients, totalMassGMin, totalMassGMax } = adjustSnapshotToTarget(
        snap.ingredients,
        targetMassG,
      );
      snap = {
        ...snap,
        ingredients,
        totalMassGMin,
        totalMassGMax,
        totalMassG: (totalMassGMin + totalMassGMax) / 2,
      };
    }

    await prisma.cookbookRecipe.create({
      data: {
        cookbookId,
        recipeId: toAdd[i],
        position: maxPos + 1 + i,
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

export async function setSectionTitle(
  entryId: number,
  title: string,
  cookbookId: number,
) {
  const t = title.trim().slice(0, 200);
  await prisma.cookbookRecipe.update({
    where: { id: entryId },
    data: { sectionTitle: t || null },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
}

// ─── Chapitres ───────────────────────────────────────────────────────────────

export async function addChapter(
  cookbookId: number,
  data: { title: string; intro?: string },
): Promise<ActionResult> {
  const title = data.title.trim();
  if (!title) return { ok: false, error: "Le titre du chapitre est obligatoire." };

  // Position : à la fin (max position toutes entrées confondues + 1)
  const [maxRecipe, maxChapter] = await Promise.all([
    prisma.cookbookRecipe.aggregate({
      where: { cookbookId },
      _max: { position: true },
    }),
    prisma.cookbookChapter.aggregate({
      where: { cookbookId },
      _max: { position: true },
    }),
  ]);
  const maxPos = Math.max(
    maxRecipe._max.position ?? -1,
    maxChapter._max.position ?? -1,
  );

  await prisma.cookbookChapter.create({
    data: {
      cookbookId,
      title: title.slice(0, 200),
      intro: data.intro?.trim().slice(0, 5000) || null,
      position: maxPos + 1,
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
  const title = data.title.trim();
  if (!title) return { ok: false, error: "Le titre du chapitre est obligatoire." };

  await prisma.cookbookChapter.update({
    where: { id: chapterId },
    data: {
      title: title.slice(0, 200),
      intro: data.intro?.trim().slice(0, 5000) || null,
    },
  });
  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

export async function deleteChapter(chapterId: number, cookbookId: number) {
  await prisma.cookbookChapter.delete({ where: { id: chapterId } });
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

// ─── Modification de la masse d'une recette figée ────────────────────────────

type SnapIngredient = { name: string; quantityG: number; unit?: string; quantityGMax?: number | null };
type SnapData = {
  ingredients: SnapIngredient[];
  totalMassG: number;
  subRecipes?: {
    ingredients: SnapIngredient[];
    totalMassG: number;
    [k: string]: unknown;
  }[];
  multiplier?: number;
  [k: string]: unknown;
};

export type UpdateSnapshotMassPayload =
  | { mode: "coefficient"; coefficient: number }
  | { mode: "mass_target"; targetMassG: number; forceExact?: boolean }
  | { mode: "pivot_ingredient"; pivotIndex: number; targetMassG: number };

/**
 * Recettes FIGÉES (📌 snapshot) uniquement : applique un coefficient à toutes
 * les quantités du snapshot pour atteindre la masse demandée.
 *
 * Trois modes (identiques à la fiche recette) :
 *  - `coefficient`     : multiplicateur direct (ex : 1.5)
 *  - `mass_target`     : on vise une masse totale (ratio = cible / total actuel)
 *  - `pivot_ingredient`: on fixe la masse d'un ingrédient (ratio = cible / qté actuelle)
 */
export async function updateSnapshotMass(
  entryId: number,
  payload: UpdateSnapshotMassPayload,
  cookbookId: number,
): Promise<ActionResult> {
  const entry = await prisma.cookbookRecipe.findUnique({
    where: { id: entryId },
    select: { linkMode: true, snapshotData: true },
  });
  if (!entry) return { ok: false, error: "Entrée introuvable." };
  if (entry.linkMode !== "snapshot" || !entry.snapshotData) {
    return { ok: false, error: "Cette entrée n'est pas figée." };
  }

  const snap = entry.snapshotData as unknown as SnapData;

  let ratio: number;
  if (payload.mode === "coefficient") {
    if (!Number.isFinite(payload.coefficient) || payload.coefficient <= 0) {
      return { ok: false, error: "Coefficient invalide (doit être > 0)." };
    }
    ratio = payload.coefficient;
  } else if (payload.mode === "mass_target") {
    if (!Number.isFinite(payload.targetMassG) || payload.targetMassG <= 0) {
      return { ok: false, error: "Masse cible invalide." };
    }
    if (!snap.totalMassG || snap.totalMassG <= 0) {
      return { ok: false, error: "Masse totale actuelle nulle, impossible de calculer." };
    }
    ratio = payload.targetMassG / snap.totalMassG;
  } else {
    if (!snap.ingredients || !snap.ingredients[payload.pivotIndex]) {
      return { ok: false, error: "Ingrédient pivot introuvable." };
    }
    const pivot = snap.ingredients[payload.pivotIndex];
    if (!pivot.quantityG || pivot.quantityG <= 0) {
      return { ok: false, error: "Quantité du pivot nulle, impossible de calculer." };
    }
    if (!Number.isFinite(payload.targetMassG) || payload.targetMassG <= 0) {
      return { ok: false, error: "Masse cible du pivot invalide." };
    }
    ratio = payload.targetMassG / pivot.quantityG;
  }

  const forceExact = payload.mode === "mass_target" && payload.forceExact === true;
  const scaledIngredients = snap.ingredients.map((i) => ({
    ...i,
    quantityG: Math.ceil(i.quantityG * ratio),
    quantityGMax: null,
    unit: i.unit ?? "g",
  }));
  const finalIngredients = forceExact
    ? adjustToTarget(scaledIngredients, payload.targetMassG).ingredients
    : scaledIngredients.map((i) => ({ ...i, quantityG: round3(i.quantityG) }));
  const newTotalMassG = finalIngredients.reduce(
    (s, i) => s + ingMass(i.quantityG, i.unit), 0,
  );

  const newSnap: SnapData = {
    ...snap,
    ingredients: finalIngredients,
    totalMassG: round3(newTotalMassG),
    subRecipes: (snap.subRecipes ?? []).map((sr) => ({
      ...sr,
      ingredients: sr.ingredients.map((i) => ({
        ...i,
        quantityG: round3(i.quantityG * ratio),
      })),
      totalMassG: round3(sr.totalMassG * ratio),
    })),
    multiplier: round3((snap.multiplier ?? 1) * ratio),
  };

  await prisma.cookbookRecipe.update({
    where: { id: entryId },
    data: {
      snapshotData: newSnap as unknown as Prisma.InputJsonValue,
      snapshotDate: new Date(),
    },
  });

  revalidatePath(`/cookbooks/${cookbookId}`);
  return { ok: true };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
