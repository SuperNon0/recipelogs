"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildRecipeSnapshot } from "@/lib/cookbooks";
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

export async function toggleGroupWithPrevious(
  entryId: number,
  value: boolean,
  cookbookId: number,
) {
  await prisma.cookbookRecipe.update({
    where: { id: entryId },
    data: { groupWithPrevious: value },
  });
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
