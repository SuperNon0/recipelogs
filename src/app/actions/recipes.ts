"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSectionTitle, recipeFormSchema } from "@/lib/validation";
import { isStepsHtmlEffectivelyEmpty } from "@/lib/pdf/template";
import { normalizeForSearch } from "@/lib/recipes";
import { scaleQty, adjustToTarget } from "@/lib/massAdjust";
import { ensureIngredientBases } from "@/lib/ingredientBases";
import { loadIngredientInfo, pieceWeightOf } from "@/lib/ingredientInfo";
import { rescaleStepText } from "@/lib/stepQty";
import { parseMold } from "@/lib/mold";

/**
 * Vrai si le contenu des étapes est exploitable (pas vide après strip HTML).
 * Évite de stocker `<p></p>` quand l'éditeur Tiptap est laissé vide.
 */
function hasMeaningfulSteps(raw: unknown): raw is string {
  return typeof raw === "string" && !isStepsHtmlEffectivelyEmpty(raw);
}

/** Noms à ajouter à la base d'ingrédients : les intertitres n'en sont pas. */
function ingredientNames(list: { name: string; unit?: string }[]): string[] {
  return list.filter((i) => !isSectionTitle(i.unit)).map((i) => i.name);
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

  // Rendement : vide = pas de rendement.
  const yieldRaw = String(formData.get("yieldCount") ?? "").trim();
  raw.yieldCount = yieldRaw ? Math.round(Number(yieldRaw.replace(",", "."))) || null : null;
  raw.yieldLabel = String(formData.get("yieldLabel") ?? "");
  const mold = parseMold(formData.get("mold"));

  const names = formData.getAll("ingredientName").map((v) => String(v));
  const qtys = formData.getAll("ingredientQty").map((v) => String(v));
  const units = formData.getAll("ingredientUnit").map((v) => String(v));
  const qtyMaxs = formData.getAll("ingredientQtyMax").map((v) => String(v));
  const ingredients: { name: string; quantityG: number; quantityGMax: number | null; unit: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const n = names[i]?.trim();
    const unit = units[i] ?? "g";
    const q = unit === "QS" || unit === "titre" ? 0 : Number(qtys[i]);
    const qMaxRaw = qtyMaxs[i]?.trim();
    const qMax = qMaxRaw ? Number(qMaxRaw) : null;
    const quantityGMax = unit !== "titre" && qMax !== null && Number.isFinite(qMax) && qMax > q ? qMax : null;
    if (n && (unit === "QS" || unit === "titre" || (Number.isFinite(q) && q >= 0))) {
      ingredients.push({ name: n, quantityG: q, quantityGMax, unit });
    }
  }
  raw.ingredients = ingredients;

  return { ...recipeFormSchema.parse(raw), mold };
}

/** parseForm avec un message d'erreur lisible (création ET modification). */
function parseFormOrThrow(formData: FormData): ReturnType<typeof parseForm> {
  try {
    return parseForm(formData);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(
        "Formulaire invalide : " + err.issues.map((i) => i.message).join(", "),
      );
    }
    throw err;
  }
}

export async function createRecipe(formData: FormData) {
  const data = parseFormOrThrow(formData);

  const recipe = await prisma.recipe.create({
    data: {
      name: data.name,
      nameNormalized: normalizeForSearch(data.name),
      source: data.source || null,
      notesTips: data.notesTips || null,
      favorite: data.favorite ?? false,
      rating: data.rating ?? null,
      folderId: data.folderId ?? null,
      yieldCount: data.yieldCount ?? null,
      yieldLabel: data.yieldCount ? data.yieldLabel || null : null,
      mold: data.mold ?? Prisma.DbNull,
      ingredients: {
        create: data.ingredients.map((ing, idx) => ({
          name: ing.name,
          quantityG: ing.quantityG,
          quantityGMax: ing.quantityGMax ?? null,
          unit: ing.unit ?? "g",
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

  await ensureIngredientBases(ingredientNames(data.ingredients));

  revalidatePath("/");
  revalidatePath("/favorites");
  redirect(`/recipes/${recipe.id}`);
}

export async function updateRecipe(id: number, formData: FormData) {
  const data = parseFormOrThrow(formData);

  await prisma.$transaction(async (tx) => {
    // Les ingrédients sont recréés (nouveaux id). On mémorise les anciens pour
    // re-pointer ensuite les sous-recettes qui utilisent l'un d'eux comme pivot
    // (sinon elles retombaient silencieusement à ×1).
    const oldIngredients = await tx.ingredient.findMany({
      where: { recipeId: id },
      select: { id: true, name: true, position: true },
    });

    await tx.recipe.update({
      where: { id },
      data: {
        name: data.name,
        nameNormalized: normalizeForSearch(data.name),
        source: data.source || null,
        notesTips: data.notesTips || null,
        favorite: data.favorite ?? false,
        rating: data.rating ?? null,
        folderId: data.folderId ?? null,
        yieldCount: data.yieldCount ?? null,
        yieldLabel: data.yieldCount ? data.yieldLabel || null : null,
        mold: data.mold ?? Prisma.DbNull,
      },
    });

    await tx.ingredient.deleteMany({ where: { recipeId: id } });
    await tx.ingredient.createMany({
      data: data.ingredients.map((ing, idx) => ({
        recipeId: id,
        name: ing.name,
        quantityG: ing.quantityG,
        quantityGMax: ing.quantityGMax ?? null,
        unit: ing.unit ?? "g",
        position: idx,
      })),
    });
    await remapPivotIngredients(tx, id, oldIngredients);

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

  await ensureIngredientBases(ingredientNames(data.ingredients));

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

/**
 * Suppression en lot de plusieurs recettes (sélection multiple).
 * Ne redirige pas : on reste sur la vue courante, les compteurs de
 * dossiers sont rafraîchis via revalidatePath.
 */
export async function deleteRecipes(
  ids: number[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const cleanIds = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  if (cleanIds.length === 0) {
    return { ok: false, error: "Aucune recette sélectionnée." };
  }
  const { count } = await prisma.recipe.deleteMany({
    where: { id: { in: cleanIds } },
  });
  revalidatePath("/");
  revalidatePath("/favorites");
  return { ok: true, count };
}

/**
 * Applique un multiplicateur global aux quantités de la recette parente
 * et écrit ces nouvelles quantités EN BASE comme nouvelle référence.
 *
 * - Ne touche PAS aux sous-recettes liées : leur configuration (calcMode,
 *   calcValue, isLocked) reste inchangée.
 * - Si le multiplicateur est ~1 (pas de changement utile), on no-op.
 */
export async function applyMultiplierToRecipe(
  id: number,
  multiplier: number,
  targetMassG?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    return { ok: false, error: "Multiplicateur invalide." };
  }
  if (Math.abs(multiplier - 1) < 1e-4 && !targetMassG) return { ok: true };

  const ingredients = await prisma.ingredient.findMany({
    where: { recipeId: id },
    orderBy: { quantityG: "desc" },
    select: { id: true, name: true, quantityG: true, quantityGMax: true, unit: true, ingredientBase: { select: { name: true } } },
  });
  if (ingredients.length === 0) {
    return { ok: false, error: "Aucun ingrédient à mettre à jour." };
  }
  const nameOf = (ing: (typeof ingredients)[number]) => ing.name ?? ing.ingredientBase?.name ?? "";
  // Poids des pièces : la masse visée par le client les compte, l'ajustement aussi.
  const info = await loadIngredientInfo(ingredients.map(nameOf));

  let scaled = ingredients.map((ing) => {
    const unit = ing.unit ?? "g";
    if (unit === "QS" || unit === "titre") return { id: ing.id, quantityG: 0, quantityGMax: null, unit };
    const s = scaleQty(Number(ing.quantityG), unit, multiplier);
    const sMax = ing.quantityGMax != null
      ? scaleQty(Number(ing.quantityGMax), unit, multiplier).quantityG
      : null;
    // scaleQty convertit les L en g : on écrit donc aussi la nouvelle unité.
    return { id: ing.id, quantityG: s.quantityG, quantityGMax: sMax, unit: s.unit };
  });

  if (targetMassG && targetMassG > 0) {
    const adjInput = scaled.map((s, i) => ({
      name: "",
      quantityG: s.quantityG,
      quantityGMax: null,
      unit: s.unit,
      pieceG: pieceWeightOf(info, nameOf(ingredients[i])),
    }));
    const { ingredients: adjusted } = adjustToTarget(adjInput, targetMassG);
    scaled = scaled.map((s, i) => ({ ...s, quantityG: adjusted[i].quantityG }));
  }

  // Le rendement et les quantités liées des étapes suivent la nouvelle base.
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    select: { yieldCount: true, stepsBlock: { select: { content: true } } },
  });
  const steps = recipe?.stepsBlock?.content;
  const newSteps = steps ? rescaleStepText(steps, multiplier) : steps;

  await prisma.$transaction([
    ...scaled.map((ing) =>
      prisma.ingredient.update({
        where: { id: ing.id },
        data: { quantityG: ing.quantityG, quantityGMax: ing.quantityGMax, unit: ing.unit },
      }),
    ),
    ...(recipe?.yieldCount
      ? [prisma.recipe.update({ where: { id }, data: { yieldCount: Math.max(1, Math.round(recipe.yieldCount * multiplier)) } })]
      : []),
    ...(steps && newSteps !== steps ? [prisma.stepsBlock.update({ where: { recipeId: id }, data: { content: newSteps! } })] : []),
  ]);

  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
  return { ok: true };
}

/** Coefficient de vente d'une recette (prix conseillé = coût matière × coef). */
export async function setRecipeSaleCoef(
  id: number,
  coef: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(coef) || coef <= 0 || coef > 100) return { ok: false, error: "Coefficient invalide." };
  await prisma.recipe.update({ where: { id }, data: { saleCoef: Math.round(coef * 100) / 100 } });
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
      parentLinks: true,
    },
  });
  if (!source) throw new Error("Recette introuvable");

  const copy = await prisma.recipe.create({
    data: {
      name: source.name + " (copie)",
      nameNormalized: normalizeForSearch(source.name + " (copie)"),
      folderId: source.folderId,
      yieldCount: source.yieldCount,
      yieldLabel: source.yieldLabel,
      saleCoef: source.saleCoef,
      mold: source.mold ?? Prisma.DbNull,
      source: source.source,
      notesTips: source.notesTips,
      favorite: false,
      rating: source.rating,
      ingredients: {
        create: source.ingredients.map((ing) => ({
          name: ing.name,
          ingredientBaseId: ing.ingredientBaseId,
          quantityG: ing.quantityG,
          quantityGMax: ing.quantityGMax ?? null,
          unit: ing.unit,
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
      // Les sous-recettes sont reprises avec leurs réglages. L'ingrédient pivot
      // appartient à la sous-recette (pas à la copie) : l'identifiant reste valable.
      parentLinks: {
        create: source.parentLinks.map((l) => ({
          childId: l.childId,
          label: l.label,
          calcMode: l.calcMode,
          calcValue: l.calcValue,
          pivotIngredientId: l.pivotIngredientId,
          isLocked: l.isLocked,
          isExact: l.isExact,
          position: l.position,
        })),
      },
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

/**
 * Après recréation des ingrédients d'une recette, re-pointe les sous-recettes
 * (dans les recettes parentes) dont le pivot visait un ancien ingrédient :
 * même nom (insensible à la casse) d'abord, sinon même position.
 */
async function remapPivotIngredients(
  tx: Prisma.TransactionClient,
  recipeId: number,
  oldIngredients: { id: number; name: string | null; position: number }[],
) {
  if (oldIngredients.length === 0) return;
  const links = await tx.subRecipe.findMany({
    where: { childId: recipeId, pivotIngredientId: { in: oldIngredients.map((o) => o.id) } },
    select: { id: true, pivotIngredientId: true },
  });
  if (links.length === 0) return;

  const fresh = await tx.ingredient.findMany({
    where: { recipeId },
    select: { id: true, name: true, position: true },
  });
  for (const link of links) {
    const old = oldIngredients.find((o) => o.id === link.pivotIngredientId);
    if (!old) continue;
    const match =
      fresh.find((f) => (f.name ?? "").toLowerCase() === (old.name ?? "").toLowerCase()) ??
      fresh.find((f) => f.position === old.position);
    await tx.subRecipe.update({
      where: { id: link.id },
      data: { pivotIngredientId: match?.id ?? null },
    });
  }
}
