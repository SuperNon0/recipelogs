"use server";

import { revalidatePath } from "next/cache";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/recipes";
import { parseRecipeKeeperCsv } from "@/lib/importRecipeKeeper";
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

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./public/uploads";
const RECIPES_IMG_DIR = join(UPLOAD_DIR, "recipekeeper");

// ─── Import CSV (existant) ────────────────────────────────────────────────────

export async function importRecipeKeeperCsv(
  formData: FormData,
): Promise<ImportResult> {
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
          source: rk.source,
          notesTips: rk.notesTips,
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
              position,
            })),
          },
        },
      });
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
  // imagePath (chemin relatif dans le ZIP) → bytes
  const imagesInZip = new Map<string, Uint8Array>();

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

      // Récupère toutes les images
      const imgPromises: Promise<void>[] = [];
      zip.forEach((path, entry) => {
        if (entry.dir) return;
        const lower = path.toLowerCase();
        if (
          lower.endsWith(".jpg") ||
          lower.endsWith(".jpeg") ||
          lower.endsWith(".png") ||
          lower.endsWith(".webp")
        ) {
          imgPromises.push(
            entry.async("uint8array").then((bytes) => {
              imagesInZip.set(path, bytes);
            }),
          );
        }
      });
      await Promise.all(imgPromises);
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

  // S'assure que le dossier d'upload existe (si on a des images)
  if (imagesInZip.size > 0) {
    try {
      mkdirSync(RECIPES_IMG_DIR, { recursive: true });
    } catch {
      // ignore
    }
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

      // Sauvegarde de la première image (si présente dans le ZIP)
      let photoPath: string | null = null;
      if (rk.images.length > 0 && imagesInZip.size > 0) {
        const imgPath = rk.images[0].path;
        const bytes = imagesInZip.get(imgPath);
        if (bytes) {
          const ext = imgPath.split(".").pop()?.toLowerCase() ?? "jpg";
          const fileName = imgPath.split("/").pop() ?? `photo.${ext}`;
          const targetPath = join(RECIPES_IMG_DIR, fileName);
          if (!existsSync(targetPath)) {
            try {
              writeFileSync(targetPath, bytes);
            } catch {
              // si l'écriture échoue, on garde la recette sans photo
            }
          }
          photoPath = `/uploads/recipekeeper/${fileName}`;
        }
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
          source: rk.source,
          notesTips: rk.notesTips,
          favorite: rk.favorite,
          rating: rk.rating,
          photoPath,
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
                    position,
                  }))
                : [],
          },
          categories: {
            create: categoryConnects,
          },
        },
      });
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

type JsonIngredient = { name: string; quantity: number; unit: string };
type JsonRecipe = {
  name: string;
  yield?: string;
  ingredients: JsonIngredient[];
  steps?: string;
  notes?: string | null;
  source?: string | null;
};

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
    default: return { unit: "g", quantityG: q };
  }
}

async function upsertIngredientBasesInsensitive(names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  for (const name of unique) {
    const existing = await prisma.ingredientBase.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (!existing) {
      await prisma.ingredientBase.create({ data: { name } }).catch(() => {});
    }
  }
}

export async function importRecipesFromJson(
  formData: FormData,
): Promise<ImportResult> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0)
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucun fichier fourni."] };

  let recipes: JsonRecipe[];
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    recipes = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return { ok: false, imported: 0, skipped: 0, errors: ["Fichier JSON invalide."] };
  }

  if (recipes.length === 0)
    return { ok: false, imported: 0, skipped: 0, errors: ["Aucune recette dans le fichier."] };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

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
          return { name: i.name.trim(), quantityG: norm.quantityG, unit: norm.unit, position };
        });

      const notesParts: string[] = [];
      if (r.yield?.trim()) notesParts.push(`Rendement : ${r.yield.trim()}`);
      if (r.notes?.trim()) notesParts.push(r.notes.trim());

      await prisma.recipe.create({
        data: {
          name: r.name.trim(),
          nameNormalized: normalizeForSearch(r.name.trim()),
          source: r.source?.trim() || null,
          notesTips: notesParts.length > 0 ? notesParts.join("\n\n") : null,
          stepsBlock: r.steps?.trim()
            ? { create: { content: r.steps.trim() } }
            : undefined,
          ingredients: { create: ingredients },
        },
      });

      await upsertIngredientBasesInsensitive(ingredients.map((i) => i.name));

      imported++;
    } catch (err) {
      errors.push(`"${r.name}" : ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, imported, skipped, errors };
}
