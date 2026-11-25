"use server";

import { requireAccess } from "@/lib/auth/guard";
import { visibleRecipeWhere } from "@/lib/auth/visibility";
import { exportRecipes, type ExportFile } from "@/lib/recipeExport";

/**
 * Réglages → Exporter des recettes : le fichier des recettes cochées, à importer dans
 * un autre RecipeLog (Réglages → Import JSON). Un rôle limité à certaines catégories
 * n'exporte que les recettes qu'il voit.
 */
export async function exportRecipesJson(ids: number[], sousRecettes: boolean): Promise<{ ok: true; fichier: string; nombre: number } | { ok: false; error: string }> {
  await requireAccess("import.run");
  const propres = [...new Set(ids.filter((i) => Number.isInteger(i) && i > 0))].slice(0, 5000);
  if (!propres.length) return { ok: false, error: "Coche au moins une recette." };
  const recettes = await exportRecipes(propres, { sousRecettes, visible: await visibleRecipeWhere() });
  if (!recettes.length) return { ok: false, error: "Aucune de ces recettes n'existe encore." };
  const f: ExportFile = { recipelog_export: 1, exporte_le: new Date().toISOString(), recettes };
  return { ok: true, fichier: JSON.stringify(f, null, 1), nombre: recettes.length };
}
