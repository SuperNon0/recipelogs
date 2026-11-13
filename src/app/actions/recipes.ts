"use server";

import { requireVisibleRecipe } from "@/lib/auth/visibility";

import { requireAccess } from "@/lib/auth/guard";
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
import { copyRecipe } from "@/lib/recipeCopy";
import { hasCycle } from "@/lib/subRecipes";
import { matchPivotIngredient } from "@/lib/pivotIdentity";

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

const NO_INGREDIENT = "Ajoute au moins un ingrédient avec une quantité (ou une sous-recette).";

/** Une sous-recette choisie dans le formulaire, ajoutée à l'enregistrement. */
export type PendingSubRecipe = {
  childId: number;
  label: string;
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient";
  calcValue: number;
  pivotIngredientId: number | null;
};

/** Lit et vérifie les sous-recettes envoyées par le formulaire (champ « subRecipes », JSON). */
async function parsePendingSubRecipes(formData: FormData, parentId: number | null): Promise<PendingSubRecipe[]> {
  const raw = String(formData.get("subRecipes") ?? "").trim();
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    throw new Error("Sous-recettes illisibles : recharge la page et réessaie.");
  }
  if (!Array.isArray(list)) return [];
  const out: PendingSubRecipe[] = [];
  for (const item of list.slice(0, 50)) {
    const it = item as Record<string, unknown>;
    const childId = Number(it.childId);
    const label = String(it.label ?? "").trim().slice(0, 200);
    const calcMode = String(it.calcMode) as PendingSubRecipe["calcMode"];
    const calcValue = Number(it.calcValue);
    const pivot = it.pivotIngredientId != null ? Number(it.pivotIngredientId) : null;
    if (!Number.isInteger(childId) || childId <= 0) throw new Error("Sous-recette invalide.");
    if (!label) throw new Error("Chaque sous-recette doit avoir un nom.");
    if (!["coefficient", "mass_target", "pivot_ingredient"].includes(calcMode)) throw new Error("Mode de calcul invalide.");
    if (!Number.isFinite(calcValue) || calcValue <= 0) throw new Error(`« ${label} » : la quantité doit être un nombre positif.`);
    if (calcMode === "pivot_ingredient" && !(pivot && Number.isInteger(pivot))) throw new Error(`« ${label} » : choisis l'ingrédient pivot.`);
    await requireVisibleRecipe(childId);
    if (parentId != null && (childId === parentId || (await hasCycle(parentId, childId)))) {
      throw new Error(`« ${label} » : cette recette contient déjà celle-ci, impossible de l'ajouter.`);
    }
    out.push({ childId, label, calcMode, calcValue, pivotIngredientId: calcMode === "pivot_ingredient" ? pivot : null });
  }
  return out;
}

/** Ajoute les sous-recettes en attente à la suite de celles déjà présentes. */
async function attachSubRecipes(tx: Prisma.TransactionClient, parentId: number, list: PendingSubRecipe[]) {
  if (list.length === 0) return;
  const maxPos = await tx.subRecipe.aggregate({ where: { parentId }, _max: { position: true } });
  let pos = (maxPos._max.position ?? -1) + 1;
  for (const sr of list) {
    await tx.subRecipe.create({
      data: {
        parentId,
        childId: sr.childId,
        label: sr.label,
        calcMode: sr.calcMode,
        calcValue: sr.calcValue,
        pivotIngredientId: sr.pivotIngredientId,
        position: pos++,
      },
    });
  }
}

type RecipeData = ReturnType<typeof parseForm>;

function insertRecipe(tx: Prisma.TransactionClient, data: RecipeData) {
  return tx.recipe.create({
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
}

export async function createRecipe(formData: FormData) {
  await requireAccess("recipes.edit");
  const data = parseFormOrThrow(formData);
  const subs = await parsePendingSubRecipes(formData, null);
  if (data.ingredients.length === 0 && subs.length === 0) throw new Error(NO_INGREDIENT);

  const recipe = await prisma.$transaction(async (tx) => {
    const created = await insertRecipe(tx, data);
    await attachSubRecipes(tx, created.id, subs);
    return created;
  });

  await ensureIngredientBases(ingredientNames(data.ingredients));

  revalidatePath("/");
  revalidatePath("/favorites");
  redirect(`/recipes/${recipe.id}`);
}

/**
 * Crée une recette depuis la fenêtre « Nouvelle sous-recette » (pendant
 * l'écriture d'une autre recette) et renvoie son id, sans changer de page.
 */
export async function createRecipeInline(
  formData: FormData,
): Promise<{ ok: true; id: number; name: string } | { ok: false; error: string }> {
  await requireAccess("recipes.edit");
  let data: RecipeData;
  try {
    data = parseFormOrThrow(formData);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Formulaire invalide." };
  }
  if (!data.ingredients.some((i) => !isSectionTitle(i.unit))) {
    return { ok: false, error: "Ajoute au moins un ingrédient." };
  }
  const recipe = await prisma.$transaction((tx) => insertRecipe(tx, data));
  await ensureIngredientBases(ingredientNames(data.ingredients));
  revalidatePath("/");
  return { ok: true, id: recipe.id, name: recipe.name };
}

export async function updateRecipe(id: number, formData: FormData) {
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(id);
  const data = parseFormOrThrow(formData);
  const subs = await parsePendingSubRecipes(formData, id);
  if (data.ingredients.length === 0 && subs.length === 0) {
    const existing = await prisma.subRecipe.count({ where: { parentId: id } });
    if (existing === 0) throw new Error(NO_INGREDIENT);
  }

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

    await attachSubRecipes(tx, id, subs);
  });

  await ensureIngredientBases(ingredientNames(data.ingredients));

  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
  redirect(`/recipes/${id}`);
}

/**
 * Avant de supprimer des recettes :
 * - refuse si l'une sert de sous-recette dans une recette gardée (message clair,
 *   au lieu d'une erreur de la base) ;
 * - une version principale supprimée laisse sa place à sa plus ancienne
 *   variante gardée : les essais restent reliés entre eux.
 */
async function prepareDeletion(ids: number[]): Promise<string | null> {
  const uses = await prisma.subRecipe.findMany({
    where: { childId: { in: ids }, parentId: { notIn: ids } },
    select: { child: { select: { name: true } }, parent: { select: { name: true } } },
  });
  if (uses.length) {
    const byChild = new Map<string, string[]>();
    for (const u of uses) byChild.set(u.child.name, [...(byChild.get(u.child.name) ?? []), u.parent.name]);
    return [...byChild]
      .map(([child, parents]) => `« ${child} » sert de sous-recette dans : ${[...new Set(parents)].join(", ")}. Retire-la d'abord de ces recettes.`)
      .join("\n");
  }
  const roots = await prisma.variant.findMany({
    where: { sourceRecipeId: { in: ids }, variantRecipeId: { notIn: ids } },
    orderBy: { id: "asc" },
    select: { id: true, sourceRecipeId: true, variantRecipeId: true },
  });
  const done = new Set<number>();
  for (const link of roots) {
    if (done.has(link.sourceRecipeId)) continue;
    done.add(link.sourceRecipeId);
    await prisma.$transaction([
      prisma.variant.delete({ where: { id: link.id } }),
      prisma.variant.updateMany({
        where: { sourceRecipeId: link.sourceRecipeId, variantRecipeId: { notIn: ids } },
        data: { sourceRecipeId: link.variantRecipeId },
      }),
    ]);
    revalidatePath(`/recipes/${link.variantRecipeId}`);
  }
  return null;
}

export async function deleteRecipe(id: number): Promise<{ ok: false; error: string } | void> {
  await requireAccess("recipes.delete");
  await requireVisibleRecipe(id);
  const error = await prepareDeletion([id]);
  if (error) return { ok: false, error };
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
  await requireAccess("recipes.delete");
  const cleanIds = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  for (const id of cleanIds) await requireVisibleRecipe(id);
  if (cleanIds.length === 0) {
    return { ok: false, error: "Aucune recette sélectionnée." };
  }
  const error = await prepareDeletion(cleanIds);
  if (error) return { ok: false, error };
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
  /** Nouveau moule d'origine (mode « Moule » vers un seul moule). Sinon, un moule
   * enregistré est effacé : les quantités ne correspondent plus à ce moule. */
  newMold?: unknown,
): Promise<{ ok: true; moldCleared?: boolean } | { ok: false; error: string }> {
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(id);
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
    // La fourchette (max) est transmise : sinon la masse visée est fausse et
    // le minimum ajusté peut dépasser le maximum (400–500 g → 975–750 g).
    const adjInput = scaled.map((s, i) => ({
      name: "",
      quantityG: s.quantityG,
      quantityGMax: s.quantityGMax,
      unit: s.unit,
      pieceG: pieceWeightOf(info, nameOf(ingredients[i])),
    }));
    const { ingredients: adjusted } = adjustToTarget(adjInput, targetMassG);
    scaled = scaled.map((s, i) => ({ ...s, quantityG: adjusted[i].quantityG, quantityGMax: adjusted[i].quantityGMax }));
  }

  // Le rendement et les quantités liées des étapes suivent la nouvelle base.
  const recipe = await prisma.recipe.findUnique({
    where: { id },
    select: { yieldCount: true, mold: true, stepsBlock: { select: { content: true } } },
  });
  const steps = recipe?.stepsBlock?.content;
  const target = parseMold(newMold);
  const moldData = target
    ? { mold: target as unknown as Prisma.InputJsonValue }
    : recipe?.mold != null
      ? { mold: Prisma.DbNull }
      : null;
  const newSteps = steps ? rescaleStepText(steps, multiplier) : steps;

  await prisma.$transaction([
    ...scaled.map((ing) =>
      prisma.ingredient.update({
        where: { id: ing.id },
        data: { quantityG: ing.quantityG, quantityGMax: ing.quantityGMax, unit: ing.unit },
      }),
    ),
    ...(recipe?.yieldCount || moldData
      ? [
          prisma.recipe.update({
            where: { id },
            data: {
              ...(recipe?.yieldCount ? { yieldCount: Math.max(1, Math.round(recipe.yieldCount * multiplier)) } : {}),
              ...(moldData ?? {}),
            },
          }),
        ]
      : []),
    ...(steps && newSteps !== steps ? [prisma.stepsBlock.update({ where: { recipeId: id }, data: { content: newSteps! } })] : []),
  ]);

  revalidatePath("/");
  revalidatePath("/favorites");
  revalidatePath(`/recipes/${id}`);
  return { ok: true, moldCleared: !target && recipe?.mold != null };
}

/** Coefficient de vente d'une recette (prix conseillé = coût matière × coef). */
export async function setRecipeSaleCoef(
  id: number,
  coef: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAccess("costs.edit");
  await requireVisibleRecipe(id);
  // Au moins 0,01 : la base garde 2 décimales (0,004 deviendrait 0).
  if (!Number.isFinite(coef) || coef < 0.01 || coef > 100) return { ok: false, error: "Coefficient invalide (entre 0,01 et 100)." };
  const { count } = await prisma.recipe.updateMany({ where: { id }, data: { saleCoef: Math.round(coef * 100) / 100 } });
  if (!count) return { ok: false, error: "Recette introuvable." };
  revalidatePath(`/recipes/${id}`);
  revalidatePath("/settings/ingredients/prix");
  return { ok: true };
}

/**
 * Prix de vente d'une recette (produit fini) pour calculer la marge.
 * `price` null = plus de prix de vente ; `vat` = TVA comprise en % (0 = prix HT).
 */
export async function setRecipeSalePrice(
  id: number,
  price: number | null,
  vat: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAccess("costs.edit");
  await requireVisibleRecipe(id);
  if (price != null && (!Number.isFinite(price) || price < 0.01 || price > 100_000)) return { ok: false, error: "Prix de vente invalide." };
  if (!Number.isFinite(vat) || vat < 0 || vat > 50) return { ok: false, error: "TVA invalide." };
  const { count } = await prisma.recipe.updateMany({
    where: { id },
    data: { salePrice: price == null ? null : Math.round(price * 100) / 100, saleVat: Math.round(vat * 100) / 100 },
  });
  if (!count) return { ok: false, error: "Recette introuvable." };
  revalidatePath(`/recipes/${id}`);
  return { ok: true };
}

export async function toggleFavorite(id: number) {
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(id);
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
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(id);
  const source = await prisma.recipe.findUnique({ where: { id }, select: { name: true } });
  if (!source) throw new Error("Recette introuvable");
  const copyId = await copyRecipe(id, source.name + " (copie)");

  revalidatePath("/");
  redirect(`/recipes/${copyId}`);
}

export async function addComment(recipeId: number, formData: FormData) {
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(recipeId);
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;
  await prisma.comment.create({
    data: { recipeId, content: content.slice(0, 5000) },
  });
  revalidatePath(`/recipes/${recipeId}`);
}

export async function deleteComment(id: number, recipeId: number) {
  await requireAccess("recipes.edit");
  await requireVisibleRecipe(recipeId);
  await prisma.comment.deleteMany({ where: { id, recipeId } });
  revalidatePath(`/recipes/${recipeId}`);
}

/**
 * Après recréation des ingrédients d'une recette, re-pointe les sous-recettes
 * (dans les recettes parentes) dont le pivot visait un ancien ingrédient :
 * même nom unique (insensible à la casse). Une suppression ou une ambiguïté
 * annule la transaction plutôt que de changer le calcul des recettes parentes.
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
    const match = matchPivotIngredient(old, oldIngredients, fresh);
    await tx.subRecipe.update({
      where: { id: link.id },
      data: { pivotIngredientId: match.id },
    });
  }
}
