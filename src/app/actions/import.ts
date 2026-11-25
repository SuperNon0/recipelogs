"use server";

import { requireAccess } from "@/lib/auth/guard";
import { revalidatePath } from "next/cache";
import JSZip from "jszip";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseMold } from "@/lib/mold";
import { normalizeForSearch } from "@/lib/recipes";
import { ensureIngredientBases } from "@/lib/ingredientBases";
import { parseRecipeKeeperCsv } from "@/lib/importRecipeKeeper";
import { importYield } from "@/lib/importYield";
import {
  parseRecipeKeeperHtml,
  type RKHtmlRecipe,
} from "@/lib/importRecipeKeeperHtml";

export type ImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: string[];
};

// ─── Import CSV (existant) ────────────────────────────────────────────────────

export async function importRecipeKeeperCsv(
  formData: FormData,
): Promise<ImportResult> {
  await requireAccess("import.run");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucun fichier fourni."] };
  }

  const text = await file.text();
  let recipes;
  try {
    recipes = parseRecipeKeeperCsv(text);
  } catch {
    return { ok: false, imported: 0, skipped: 0, errors: ["Fichier CSV invalide."] };
  }

  if (recipes.length === 0) {
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucune recette trouvée dans le fichier."] };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rk of recipes) {
    try {
      const exists = await prisma.recipe.findFirst({
        where: { name: rk.name },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }

      await prisma.recipe.create({
        data: {
          name: rk.name,
          nameNormalized: normalizeForSearch(rk.name),
          source: rk.source,
          ...importYield(rk.portionSize, rk.notesTips),
          stepsBlock: rk.steps
            ? { create: { content: rk.steps } }
            : undefined,
          tags: {
            create: rk.tags.map((tag) => ({ name: tag })),
          },
          ingredients: {
            create: rk.ingredients.map((ing, position) => ({
              name: ing.name,
              quantityG: ing.quantityG || 0,
              quantityGMax: ing.quantityGMax ?? undefined,
              unit: ing.unit || "g",
              position,
            })),
          },
        },
      });
      await ensureIngredientBases(rk.ingredients.map((i) => i.name));
      imported++;
    } catch (err) {
      errors.push(`"${rk.name}" : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/settings");

  return { ok: true, imported, skipped, errors };
}

// ─── Import HTML / ZIP (nouveau) ─────────────────────────────────────────────

export async function importRecipeKeeperHtmlOrZip(
  formData: FormData,
): Promise<ImportResult> {
  await requireAccess("import.run");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucun fichier fourni."] };
  }

  const lowerName = file.name.toLowerCase();
  const isZip = lowerName.endsWith(".zip");
  const isHtml = lowerName.endsWith(".html") || lowerName.endsWith(".htm");

  if (!isZip && !isHtml) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      errors: ["Format non reconnu. Attendu : .html ou .zip de Recipe Keeper."],
    };
  }

  let htmlText: string;

  try {
    if (isZip) {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);

      // Cherche le fichier HTML principal
      let htmlEntry: JSZip.JSZipObject | null = null;
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        const lower = path.toLowerCase();
        if ((lower.endsWith(".html") || lower.endsWith(".htm")) && !htmlEntry) {
          htmlEntry = entry;
        }
      });
      if (!htmlEntry) {
        return {
          ok: false,
          imported: 0,
          skipped: 0,
          errors: ["Aucun fichier .html trouvé dans le ZIP."],
        };
      }
      htmlText = await (htmlEntry as JSZip.JSZipObject).async("text");
    } else {
      htmlText = await file.text();
    }
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      errors: [
        `Lecture du fichier impossible : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      ],
    };
  }

  let recipes: RKHtmlRecipe[];
  try {
    recipes = parseRecipeKeeperHtml(htmlText);
  } catch (err) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      errors: [
        `Erreur de parsing du HTML : ${err instanceof Error ? err.message : "inconnue"}`,
      ],
    };
  }

  if (recipes.length === 0) {
    return {
      ok: false,
      imported: 0,
      skipped: 0,
      errors: ["Aucune recette détectée dans le HTML."],
    };
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const rk of recipes) {
    try {
      const exists = await prisma.recipe.findFirst({
        where: { name: rk.name },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }

      // Lookup ou création des catégories
      const categoryConnects: { categoryId: number }[] = [];
      for (const catName of rk.categories) {
        if (!catName) continue;
        let cat = await prisma.category.findUnique({
          where: { name: catName },
          select: { id: true },
        });
        if (!cat) {
          cat = await prisma.category.create({
            data: { name: catName },
            select: { id: true },
          });
        }
        if (!categoryConnects.some((c) => c.categoryId === cat!.id)) {
          categoryConnects.push({ categoryId: cat.id });
        }
      }

      await prisma.recipe.create({
        data: {
          name: rk.name,
          nameNormalized: normalizeForSearch(rk.name),
          source: rk.source,
          ...importYield(rk.portionSize, rk.notesTips),
          favorite: rk.favorite,
          rating: rk.rating,
          stepsBlock: rk.steps ? { create: { content: rk.steps } } : undefined,
          tags: {
            create: rk.tags.map((tag) => ({ name: tag })),
          },
          ingredients: {
            create:
              rk.ingredients.length > 0
                ? rk.ingredients.map((ing, position) => ({
                    name: ing.name,
                    quantityG: ing.quantityG || 0,
                    quantityGMax: ing.quantityGMax ?? undefined,
                    unit: ing.unit || "g",
                    position,
                  }))
                : [],
          },
          categories: {
            create: categoryConnects,
          },
        },
      });
      await ensureIngredientBases(rk.ingredients.map((i) => i.name));
      imported++;
    } catch (err) {
      errors.push(
        `"${rk.name}" : ${err instanceof Error ? err.message : "erreur inconnue"}`,
      );
    }
  }

  revalidatePath("/");
  revalidatePath("/settings");

  return { ok: true, imported, skipped, errors };
}

// ─── Import JSON ──────────────────────────────────────────────────────────────

type JsonIngredient = { name: string; quantity: number; quantity_max?: number | null; unit: string };
type JsonRecipe = {
  name: string;
  /** Rendement en texte libre (« 12 parts »), rangé dans les notes. */
  yield?: string;
  /** Rendement chiffré, comme l'export de RecipeLog (« 40 » + « financiers »). */
  yield_count?: number | null;
  yield_label?: string | null;
  sale_coef?: number | null;
  sale_price?: number | null;
  sale_vat?: number | null;
  ingredients: JsonIngredient[];
  steps?: string;
  notes?: string | null;
  source?: string | null;
  /** Champs de l'export RecipeLog. Dossier et catégories : reliés s'ils existent déjà (par leur nom). */
  mold?: unknown;
  folder?: string | null;
  categories?: string[];
  tags?: string[];
  favorite?: boolean;
  rating?: number | null;
  /** Fichier « Exporter des recettes » : couleurs pour créer les dossiers et catégories qui manquent. */
  folder_color?: string | null;
  category_colors?: Record<string, string>;
  /** Sous-recettes, par le nom de la recette utilisée (dans le fichier ou déjà là). */
  sub_recipes?: {
    recipe: string;
    label?: string;
    calc_mode?: string;
    calc_value?: number;
    pivot_position?: number | null;
    is_locked?: boolean;
    is_exact?: boolean;
    position?: number;
  }[];
};

const COULEUR_RE = /^#[0-9a-fA-F]{6}$/;

function normalizeImportUnit(rawUnit: string, rawQty: number): { unit: string; quantityG: number } {
  const u = (rawUnit ?? "").toLowerCase().trim();
  const q = Number(rawQty) || 0;
  switch (u) {
    case "ml": case "millilitre": case "millilitres": return { unit: "g", quantityG: q };
    case "cl": case "centilitre": case "centilitres": return { unit: "g", quantityG: q * 10 };
    case "dl": case "décilitre": case "decilitre": case "décilitres": return { unit: "g", quantityG: q * 100 };
    case "kg": case "kilogramme": case "kilogrammes": return { unit: "g", quantityG: q * 1000 };
    case "g": case "gr": case "gramme": case "grammes": return { unit: "g", quantityG: q };
    case "l": case "litre": case "litres": return { unit: "L", quantityG: q };
    case "cc": case "cuillère à café": case "cuillere a cafe": return { unit: "cc", quantityG: q };
    case "cs": case "cuillère à soupe": case "cuillere a soupe": return { unit: "cs", quantityG: q };
    case "pièce": case "piece": case "pcs": case "unité": case "unite": return { unit: "pièce", quantityG: q };
    case "qs": return { unit: "QS", quantityG: 0 };
    case "titre": return { unit: "titre", quantityG: 0 };
    default: return { unit: "g", quantityG: q };
  }
}

export async function importRecipesFromJson(
  formData: FormData,
): Promise<ImportResult> {
  await requireAccess("import.run");
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0)
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucun fichier fourni."] };

  let recipes: JsonRecipe[];
  let fromExport = false;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    // Fichier de « Exporter des recettes » : { recipelog_export: 1, recettes: [...] }.
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray(parsed.recettes)) {
      fromExport = true;
      recipes = parsed.recettes;
    } else recipes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { ok: false, imported: 0, skipped: 0, errors: ["Fichier JSON invalide."] };
  }

  if (recipes.length === 0)
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucune recette dans le fichier."] };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  const aRelier: { parentId: number; name: string; liens: NonNullable<JsonRecipe["sub_recipes"]> }[] = [];

  for (const r of recipes) {
    if (!r.name?.trim()) { errors.push("Recette sans nom ignorée."); continue; }

    try {
      const exists = await prisma.recipe.findFirst({
        where: { name: r.name.trim() },
        select: { id: true },
      });
      if (exists) { skipped++; continue; }

      const ingredients = (r.ingredients ?? [])
        .filter((i) => i.name?.trim())
        .map((i, position) => {
          const norm = normalizeImportUnit(i.unit, i.quantity);
          const rawMax = i.quantity_max != null && norm.quantityG > 0
            ? normalizeImportUnit(i.unit, i.quantity_max).quantityG
            : null;
          // Fourchette inversée ou vide (max ≤ min) : on garde la quantité seule.
          const max = rawMax != null && rawMax > norm.quantityG ? rawMax : null;
          return { name: i.name.trim(), quantityG: norm.quantityG, quantityGMax: max, unit: norm.unit, position };
        });

      const notesParts: string[] = [];
      if (r.yield?.trim()) notesParts.push(`Rendement : ${r.yield.trim()}`);
      if (r.notes?.trim()) notesParts.push(r.notes.trim());

      // Fichier exporté d'un autre RecipeLog : on crée les dossiers et catégories qui manquent ici.
      if (fromExport && typeof r.folder === "string" && r.folder.trim()) {
        const color = typeof r.folder_color === "string" && COULEUR_RE.test(r.folder_color) ? r.folder_color : undefined;
        await prisma.folder.upsert({ where: { name: r.folder.trim() }, update: {}, create: { name: r.folder.trim(), ...(color ? { color } : {}) } });
      }
      if (fromExport && Array.isArray(r.categories)) {
        for (const name of r.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 50)) {
          const c = r.category_colors?.[name];
          const color = typeof c === "string" && COULEUR_RE.test(c) ? c : undefined;
          await prisma.category.upsert({ where: { name }, update: {}, create: { name, ...(color ? { color } : {}) } });
        }
      }
      const folder = typeof r.folder === "string" && r.folder.trim()
        ? await prisma.folder.findUnique({ where: { name: r.folder.trim() }, select: { id: true } })
        : null;
      const categories = Array.isArray(r.categories) && r.categories.length
        ? await prisma.category.findMany({ where: { name: { in: r.categories.map((c) => String(c).trim()) } }, select: { id: true } })
        : [];
      const tags = Array.isArray(r.tags)
        ? [...new Set(r.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 50)
        : [];
      const mold = parseMold(r.mold);
      const rating = typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5 ? Math.round(r.rating) : null;

      const created = await prisma.recipe.create({
        select: { id: true },
        data: {
          name: r.name.trim(),
          nameNormalized: normalizeForSearch(r.name.trim()),
          folderId: folder?.id ?? null,
          favorite: r.favorite === true,
          rating,
          ...(mold ? { mold: mold as unknown as Prisma.InputJsonValue } : {}),
          categories: { create: categories.map((c) => ({ categoryId: c.id })) },
          tags: { create: tags.map((name) => ({ name })) },
          source: r.source?.trim() || null,
          notesTips: notesParts.length > 0 ? notesParts.join("\n\n") : null,
          stepsBlock: r.steps?.trim()
            ? { create: { content: r.steps.trim() } }
            : undefined,
          ingredients: { create: ingredients },
          yieldCount: r.yield_count && r.yield_count > 0 ? Math.round(r.yield_count) : null,
          yieldLabel: r.yield_count && r.yield_count > 0 ? r.yield_label?.trim() || null : null,
          saleCoef: r.sale_coef && r.sale_coef > 0 && r.sale_coef <= 100 ? r.sale_coef : null,
          salePrice: r.sale_price && r.sale_price > 0 && r.sale_price <= 100_000 ? Math.round(r.sale_price * 100) / 100 : null,
          saleVat: r.sale_vat != null && r.sale_vat >= 0 && r.sale_vat <= 50 ? r.sale_vat : null,
        },
      });

      // Les intertitres (« Pâte », « Crème ») ne vont pas dans la base d'ingrédients.
      await ensureIngredientBases(ingredients.filter((i) => i.unit !== "titre").map((i) => i.name));

      if (Array.isArray(r.sub_recipes) && r.sub_recipes.length) aRelier.push({ parentId: created.id, name: r.name.trim(), liens: r.sub_recipes });
      imported++;
    } catch (err) {
      errors.push(`"${r.name}" : ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  // Sous-recettes : reliées une fois toutes les recettes créées (la recette utilisée
  // peut venir plus loin dans le fichier, ou exister déjà ici sous le même nom).
  for (const p of aRelier) {
    for (const [i, l] of p.liens.entries()) {
      const nom = typeof l?.recipe === "string" ? l.recipe.trim() : "";
      if (!nom) continue;
      try {
        const child = await prisma.recipe.findFirst({
          where: { name: nom },
          select: { id: true, ingredients: { select: { id: true }, orderBy: { position: "asc" } } },
        });
        if (!child || child.id === p.parentId) {
          errors.push(`"${p.name}" : sous-recette « ${nom} » introuvable, à ajouter à la main.`);
          continue;
        }
        const mode = l.calc_mode === "mass_target" || l.calc_mode === "pivot_ingredient" ? l.calc_mode : "coefficient";
        const pivot = mode === "pivot_ingredient" && Number.isInteger(l.pivot_position) ? child.ingredients[l.pivot_position as number]?.id ?? null : null;
        const value = typeof l.calc_value === "number" && Number.isFinite(l.calc_value) && l.calc_value > 0 ? l.calc_value : 1;
        await prisma.subRecipe.create({
          data: {
            parentId: p.parentId,
            childId: child.id,
            label: typeof l.label === "string" && l.label.trim() ? l.label.trim().slice(0, 200) : nom,
            // Pivot perdu (ingrédient introuvable) : on garde la quantité en coefficient 1.
            calcMode: mode === "pivot_ingredient" && pivot == null ? "coefficient" : mode,
            calcValue: mode === "pivot_ingredient" && pivot == null ? 1 : value,
            pivotIngredientId: pivot,
            isLocked: l.is_locked === true,
            isExact: l.is_exact === true,
            position: Number.isInteger(l.position) ? (l.position as number) : i,
          },
        });
      } catch (err) {
        errors.push(`"${p.name}" : sous-recette « ${nom} » : ${err instanceof Error ? err.message : "erreur"}`);
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, imported, skipped, errors };
}
