/**
 * Import depuis Recipe Keeper (export CSV).
 *
 * Format CSV Recipe Keeper (colonnes principales) :
 *   Name, Description, Ingredients, Directions, PrepTime, CookTime,
 *   Servings, Calories, Fat, Cholesterol, Sodium, Carbohydrate, Protein,
 *   Source, Photo, Categories
 *
 * Les ingrédients sont séparés par des sauts de ligne dans la cellule.
 * Les quantités sont en format texte libre ("200g farine", "2 oeufs", etc.)
 * — on extrait le nombre en grammes si possible, sinon on crée un ingrédient libre.
 */

import { extractQuantityAndUnit, cleanIngredientName } from "./parseIngredientsText";

export type RKRecipe = {
  name: string;
  source: string | null;
  notesTips: string | null;
  steps: string | null;
  ingredients: { name: string; quantityG: number; quantityGMax?: number; unit: string }[];
  tags: string[];
};

/** Parse le CSV exporté par Recipe Keeper. */
export function parseRecipeKeeperCsv(csvText: string): RKRecipe[] {
  const lines = splitCsvRows(csvText);
  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (col: string) => headers.indexOf(col);

  const iName = idx("name");
  const iIngredients = idx("ingredients");
  const iDirections = idx("directions");
  const iSource = idx("source");
  const iDescription = idx("description");
  const iCategories = idx("categories");

  const recipes: RKRecipe[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvRow(lines[i]);
    const get = (col: number) => (col >= 0 ? (row[col] ?? "").trim() : "");

    const name = get(iName);
    if (!name) continue;

    const rawIngredients = get(iIngredients);
    const ingredients = parseIngredients(rawIngredients);

    const directions = get(iDirections);
    const source = get(iSource) || null;
    const description = get(iDescription);

    const rawCats = get(iCategories);
    const tags = rawCats
      ? rawCats.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
      : [];

    const notesTips = description || null;

    recipes.push({
      name,
      source,
      notesTips,
      steps: directions || null,
      ingredients,
      tags,
    });
  }

  return recipes;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseIngredients(raw: string): { name: string; quantityG: number; quantityGMax?: number; unit: string }[] {
  if (!raw) return [];

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const { quantityG, quantityGMax, unit } = extractQuantityAndUnit(line);
      const name = cleanIngredientName(line);
      return { name: name || line, quantityG, quantityGMax, unit };
    });
}

// ─── CSV parser minimal ───────────────────────────────────────────────────────

function splitCsvRows(csv: string): string[] {
  const rows: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    const next = csv[i + 1];

    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      // Guillemet échappé "" : consommer le second et le conserver brut
      if (inQuotes && next === '"') {
        current += next;
        i++;
        inQuotes = false;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      if (current.trim()) rows.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) rows.push(current);
  return rows;
}

function parseCsvRow(row: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    const next = row[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}
