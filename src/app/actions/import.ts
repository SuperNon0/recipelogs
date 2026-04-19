"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { parseRecipeKeeperCsv } from "@/lib/importRecipeKeeper";

export type ImportResult = {
  ok: boolean;
  imported: number;
  skipped: number;
  errors: string[];
};

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
      // Vérifier si la recette existe déjà (par nom exact)
      const exists = await prisma.recipe.findFirst({
        where: { name: rk.name },
        select: { id: true },
      });
      if (exists) {
        skipped++;
        continue;
      }

      // Créer la recette
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
