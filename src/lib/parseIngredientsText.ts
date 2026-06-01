/**
 * Parse une zone de texte libre en liste d'ingrédients structurés.
 *
 * Une ligne = un ingrédient. Formats acceptés :
 *   "200g farine"                → { name: "farine", quantityG: 200, unit: "g" }
 *   "Farine - 200g"              → { name: "Farine", quantityG: 200, unit: "g" }
 *   "100-200g sucre"             → { name: "sucre", quantityG: 100, quantityGMax: 200, unit: "g" }
 *   "1kg sucre"                  → { name: "sucre", quantityG: 1000, unit: "g" }
 *   "250ml lait"                 → { name: "lait", quantityG: 0.25, unit: "L" }
 *   "2 cuillères à café vanille" → { name: "vanille", quantityG: 10, unit: "cc" }
 *   "1 cs huile"                 → { name: "huile", quantityG: 15, unit: "cs" }
 *
 * Format multi-lignes (style fiche pâtissier) :
 *   "Farine\n- 200g\nBeurre\n- 100g"
 *   → [ {Farine, 200, g}, {Beurre, 100, g} ]
 */

export type ParsedIngredient = {
  name: string;
  quantityG: number;
  quantityGMax?: number;
  unit: string;
};

export type ParsedQuantity = {
  quantityG: number;
  quantityGMax?: number;
  unit: string;
};

/**
 * Extrait quantité, unité et fourchette depuis un texte libre.
 * Exporté pour être réutilisé par les autres parseurs d'import.
 */
export function extractQuantityAndUnit(text: string): ParsedQuantity {
  // Fourchette de poids : "100-200g" ou "100 à 200g" ou "100–200g"
  const rangeGMatch = text.match(/(\d+(?:[.,]\d+)?)\s*[-–à]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (rangeGMatch) return {
    quantityG: parseFloat(rangeGMatch[1].replace(",", ".")),
    quantityGMax: parseFloat(rangeGMatch[2].replace(",", ".")),
    unit: "g",
  };

  // Fourchette en kg : "0.5-1kg"
  const rangeKgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*[-–à]\s*(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (rangeKgMatch) return {
    quantityG: parseFloat(rangeKgMatch[1].replace(",", ".")) * 1000,
    quantityGMax: parseFloat(rangeKgMatch[2].replace(",", ".")) * 1000,
    unit: "g",
  };

  // Cuillère à café : cc, c. à café, c.à.c, cuillère à café, cuillères à café
  const ccMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:cc\b|c\.?\s*[àa]\.?\s*caf|cuill?[eè]r?e?s?\s*[àa]\s*caf)/i,
  );
  if (ccMatch) return {
    quantityG: parseFloat(ccMatch[1].replace(",", ".")) * 5,
    unit: "cc",
  };

  // Cuillère à soupe : cs, c. à soupe, c.à.s, cuillère à soupe, cuillères à soupe
  const csMatch = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:cs\b|c\.?\s*[àa]\.?\s*s(?:oupe)?|cuill?[eè]r?e?s?\s*[àa]\s*soupe)/i,
  );
  if (csMatch) return {
    quantityG: parseFloat(csMatch[1].replace(",", ".")) * 15,
    unit: "cs",
  };

  // kg → g
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*kg\b/i);
  if (kgMatch) return {
    quantityG: parseFloat(kgMatch[1].replace(",", ".")) * 1000,
    unit: "g",
  };

  // g
  const gMatch = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gMatch) return {
    quantityG: parseFloat(gMatch[1].replace(",", ".")),
    unit: "g",
  };

  // ml → L (250ml = 0.25L, pas de conversion ml→g erronée)
  const mlMatch = text.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlMatch) return {
    quantityG: parseFloat(mlMatch[1].replace(",", ".")) / 1000,
    unit: "L",
  };

  // cl → L
  const clMatch = text.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clMatch) return {
    quantityG: parseFloat(clMatch[1].replace(",", ".")) / 100,
    unit: "L",
  };

  // l → L
  const lMatch = text.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lMatch) return {
    quantityG: parseFloat(lMatch[1].replace(",", ".")),
    unit: "L",
  };

  return { quantityG: 0, unit: "g" };
}

export function parseIngredientsText(raw: string): ParsedIngredient[] {
  if (!raw.trim()) return [];

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ParsedIngredient[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ligne de quantité seule (commence par - ou ·) → l'attacher à la précédente
    const qtyOnly = line.match(/^[-·•]\s*(\d.*)/);
    if (qtyOnly && result.length > 0) {
      const last = result[result.length - 1];
      const qty = extractQuantityAndUnit(qtyOnly[1]);
      if (qty.quantityG > 0 && last.quantityG === 0) {
        last.quantityG = qty.quantityG;
        last.quantityGMax = qty.quantityGMax;
        last.unit = qty.unit;
        continue;
      }
    }

    const { quantityG, quantityGMax, unit } = extractQuantityAndUnit(line);
    const name = cleanIngredientName(line);
    result.push({ name: name || line, quantityG, quantityGMax, unit });
  }

  return result;
}

/** Enlève la quantité en début/fin de ligne pour ne garder que le nom. */
export function cleanIngredientName(text: string): string {
  return text
    .replace(/^\d+(?:[.,]\d+)?\s*[-–à]\s*\d+(?:[.,]\d+)?\s*(kg|g)\b\.?\s*/i, "")
    .replace(/^\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l|cc|cs|oz|lb|tsp|tbsp|cup|pcs?|unit[eé]?s?)\.?\s*/i, "")
    .replace(/^\d+(?:[.,]\d+)?\s*(?:cuill?[eè]r?e?s?\s*[àa]\s*(?:caf[eé]|soupe))\s*/i, "")
    .replace(/[-–·•]\s*\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l)\.?$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l)$/i, "")
    .replace(/^\d+\s*\/\s*\d+\s*/, "")
    .replace(/^\d+\s+/, "")
    .trim();
}
