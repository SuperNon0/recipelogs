"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recipeFormSchema } from "@/lib/validation";
import { isStepsHtmlEffectivelyEmpty } from "@/lib/pdf/template";
import { roundQty } from "@/lib/format";

/**
 * Vrai si le contenu des étapes est exploitable (pas vide après strip HTML).
 * Évite de stocker `<p></p>` quand l'éditeur Tiptap est laissé vide.
 */
function hasMeaningfulSteps(raw: unknown): raw is string {
  return typeof raw === "string" && !isStepsHtmlEffectivelyEmpty(raw);
}

function parseForm(formData: FormData) {
  const raw: Record<string, unknown> = {
    name: formData.get("name"),
    source: formData.get("source") ?? "",
    notesTips: formData.get("notesTips") ?? "",
    steps: formData.get("steps") ?? "",
    favorite: formData.get("favorite") === "on",
    rating: formData.get("rating") || null,
  };

  const tagsRaw = String(formData.get("tags") ?? "").trim();
  raw.tags = tagsRaw
    ? tagsRaw
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  raw.categoryIds = formData
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0);

  const folderIdRaw = formData.get("folderId");
  if (folderIdRaw && String(folderIdRaw).trim() !== "") {
    const n = Number(folderIdRaw);
    raw.folderId = Number.isFinite(n) && n > 0 ? n : null;
  } else {
    raw.folderId = null;
  }

  const names = formData.getAll("ingredientName").map((v) => String(v));
  const qtys = formData.getAll("ingredientQty").map((v) => String(v));
  const ingredients: { name: string; quantityG: number }[] = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i]?.trim();
    const q = Number(qtys[i]);
    if (n && Number.isFinite(q) && q > 0) {
      ingredients.push({ name: n, quantityG: q });
    }
  }
  raw.ingredients = ingredients;

  return recipeFormSchema.parse(raw);
}

export async function createRecipe(formData: FormData) {
  let data: z.infer<typeof recipeFormSchema>;
  try {
    data = parseForm(formData);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        "Formulaire invalide : " + err.issues.map((i) => i.message).join(", "),
      );
    }
    throw err;
  }

  const recipe = await prisma.recipe.create({
    data: {
      name: data.name,
      source: data.source || null,
      notesTips: data.notesTips || null,
      favorite: data.favorite ?? false,
      rating: data.rating ?? null,
      folderId: data.folderId ?? null,
      ingredients: {
        create: data.ingredients.map((ing, idx) => ({
          name: ing.name,
          quantityG: ing.quantityG,
          position: idx,
        })),
      },
      tags: data.tags?.length
        ? { create: data.tags.map((name) => ({ name })) }
        : undefined,
      categories: data.categoryIds?.length
        ? {
            create: data.categoryIds.map((categoryId) => ({ categoryId })),
          }
        : undefined,
      stepsBlock: hasMeaningfulSteps(data.steps)
        ? { create: { content: data.steps.trim() } }
        : undefined,
    },
  });

  revalidatePath("/");
  revalidatePath("/favorites");
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(id: number, formData: FormData) {
  const data = parseForm(formData);

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({
      where: { id },
      data: {
        name: data.name,
        source: data.source || null,
        notesTips: data.notesTips || null,
        favorite: data.favorite ?? false,
        rating: data.rating ?? null,
        folderId: data.folderId ?? null,
      },
    });

    await tx.ingredient.deleteMany({ where: { recipeId: id } });
    await tx.ingredient.createMany({
      data: data.ingredients.map((ing, idx) => ({
        recipeId: id,
        name: ing.name,
        quantityG: ing.quantityG,
        position: idx,
      })),
    });

    await tx.tag.deleteMany({ where: { recipeId: id } });
    if (data.tags?.length) {
      await tx.tag.createMany({
        data: data.tags.map((name) => ({ recipeId: id, name })),
      });
    }

    await tx.recipeCategory.deleteMany({ where: { recipeId: id } });
    if (data.categoryIds?.length) {
      await tx.recipeCategory.createMany({
        data: data.categoryIds.map((categoryId) => ({
          recipeId: id,
          categoryId,
        })),
      });
    }

    if (hasMeaningfulSteps(data.steps)) {
      await tx.stepsBlock.upsert({
        where: { recipeId: id },
        update: { content: data.steps.trim() },
        create: { recipeId: id, content: data.steps.trim() },
      });
    } else {
      await tx.stepsBlock.deleteMany({ where: { recipeId: id } });
    }
  });

  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(id: number) {
  await prisma.recipe.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/favorites");
  redirect("/");
}

export type ApplyMultiplierResult =
  | { ok: true }
  | { ok: false; error: string; usedInPivotOf?: { id: number; name: string }[] };

/**
 * Applique un multiplicateur global aux quantités de la recette parente
 * et écrit ces nouvelles quantités EN BASE comme nouvelle référence.
 *
 * - Ne touche PAS aux sous-recettes liées : leur configuration (calcMode,
 *   calcValue, isLocked) reste inchangée.
 * - Si la recette est utilisée comme pivot d'une autre (mode `pivot_ingredient`),
 *   on renvoie `usedInPivotOf` et on demande une confirmation explicite via
 *   `confirmed=true` : le pivot est un point d'ancrage, le multiplier va
 *   décaler le calcul dans les recettes parentes.
 * - UPDATE SQL unique batché pour éviter N round-trips en transaction.
 * - Si le multiplicateur est ~1 (pas de changement utile), on no-op.
 */
export async function applyMultiplierToRecipe(
  id: number,
  multiplier: number,
  confirmed = false,
): Promise<ApplyMultiplierResult> {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return { ok: false, error: "Multiplicateur invalide." };
  }
  // No-op si on est très proche de 1 (à 0.1 ‰ près).
  if (Math.abs(multiplier - 1) < 1e-4) return { ok: true };

  // Garde-fou : si la recette est utilisée comme pivot d'un parent, on avertit
  // avant de modifier ses quantités (sinon les calculs pivots dérivent).
  if (!confirmed) {
    const pivotUsages = await prisma.subRecipe.findMany({
      where: { childId: id, calcMode: "pivot_ingredient" },
      select: { parent: { select: { id: true, name: true } } },
    });
    if (pivotUsages.length > 0) {
      const seen = new Map<number, string>();
      for (const u of pivotUsages) {
        if (!seen.has(u.parent.id)) seen.set(u.parent.id, u.parent.name);
      }
      return {
        ok: false,
        error:
          "Cette recette est utilisée comme pivot dans d'autres recettes. Confirmez pour continuer.",
        usedInPivotOf: [...seen.entries()].map(([id, name]) => ({ id, name })),
      };
    }
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { recipeId: id },
    select: { id: true, quantityG: true },
  });
  if (ingredients.length === 0) {
    return { ok: false, error: "Aucun ingrédient à mettre à jour." };
  }

  // Batch : un seul UPDATE SQL, arrondi côté application via une expression CASE.
  // On construit `CASE id WHEN … THEN … END` avec des bindings paramétrés
  // (pas d'interpolation directe → pas d'injection).
  const cases: Prisma.Sql[] = ingredients.map(
    (ing) =>
      Prisma.sql`WHEN ${ing.id} THEN ${roundQty(Number(ing.quantityG) * multiplier)}`,
  );
  const ids = ingredients.map((i) => i.id);

  await prisma.$executeRaw`
    UPDATE "ingredients"
    SET "quantity_g" = CASE "id" ${Prisma.join(cases, " ")} END
    WHERE "id" IN (${Prisma.join(ids)})
  `;

  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
  return { ok: true };
}

export async function toggleFavorite(id: number) {
  const r = await prisma.recipe.findUnique({
    where: { id },
    select: { favorite: true },
  });
  if (!r) return;
  await prisma.recipe.update({
    where: { id },
    data: { favorite: !r.favorite },
  });
  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
}

export async function duplicateRecipe(id: number) {
  const source = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: true,
      tags: true,
      categories: true,
      stepsBlock: true,
    },
  });
  if (!source) throw new Error("Recette introuvable");

  const copy = await prisma.recipe.create({
    data: {
      name: source.name + " (copie)",
      source: source.source,
      notesTips: source.notesTips,
      favorite: false,
      rating: source.rating,
      ingredients: {
        create: source.ingredients.map((ing) => ({
          name: ing.name,
          ingredientBaseId: ing.ingredientBaseId,
          quantityG: ing.quantityG,
          position: ing.position,
        })),
      },
      tags: { create: source.tags.map((t) => ({ name: t.name })) },
      categories: {
        create: source.categories.map((c) => ({ categoryId: c.categoryId })),
      },
      stepsBlock: source.stepsBlock
        ? { create: { content: source.stepsBlock.content } }
        : undefined,
    },
  });

  revalidatePath("/");
  redirect(`/recipes/${copy.id}`);
}

export async function addComment(recipeId: number, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await prisma.comment.create({
    data: { recipeId, content: content.slice(0, 5000) },
  });
  revalidatePath(`/recipes/${recipeId}`);
}

export async function deleteComment(id: number, recipeId: number) {
  await prisma.comment.delete({ where: { id } });
  revalidatePath(`/recipes/${recipeId}`);
}
