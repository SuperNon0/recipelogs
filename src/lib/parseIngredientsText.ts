/**
 * Parse une zone de texte libre en liste d'ingrédients structurés.
 *
 * Une ligne = un ingrédient. Formats acceptés :
 *   "200g farine"            → { name: "farine", quantityG: 200 }
 *   "Farine - 200g"          → { name: "Farine", quantityG: 200 }
 *   "Beurre"                 → { name: "Beurre", quantityG: 0 }
 *   "1kg sucre"              → { name: "sucre", quantityG: 1000 }
 *   "500 ml lait"            → { name: "lait", quantityG: 500 } (1ml ≈ 1g)
 *   "591g lait"              → { name: "lait", quantityG: 591 }
 *
 * Format multi-lignes (style fiche pâtissier) :
 *   "Farine\n- 200g\nBeurre\n- 100g"
 *   → [ {Farine, 200}, {Beurre, 100} ]
 */

export type ParsedIngredient = { name: string; quantityG: number };

export function parseIngredientsText(raw: string): ParsedIngredient[] {
  if (!raw.trim()) return [];

  // Détection du format "Nom\n- Xg" (ligne nom puis ligne quantité)
  // Si une ligne commence par "-" ou "·" suivie d'une quantité, on l'associe à la précédente
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
      const qty = extractGrams(qtyOnly[1]);
      if (qty > 0 && last.quantityG === 0) {
        last.quantityG = qty;
        continue;
      }
    }

    // Ligne complète : extraire quantité + nom
    const qty = extractGrams(line);
    const name = cleanIngredientName(line);
    result.push({ name: name || line, quantityG: qty });
  }

  return result;
}

/**
 * Tente d'extraire une quantité en grammes depuis un texte libre.
 * Exemples : "200g farine", "200 g", "0.5kg", "500 ml" (eau ≈ 1g/ml)
 */
function extractGrams(text: string): number {
  const kgMatch = text.match(/(\d+(?:[.,]\d+)?)\s*kg/i);
  if (kgMatch) return parseFloat(kgMatch[1].replace(",", ".")) * 1000;

  const gMatch = text.match(/(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (gMatch) return parseFloat(gMatch[1].replace(",", "."));

  const mlMatch = text.match(/(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mlMatch) return parseFloat(mlMatch[1].replace(",", "."));

  const clMatch = text.match(/(\d+(?:[.,]\d+)?)\s*cl\b/i);
  if (clMatch) return parseFloat(clMatch[1].replace(",", ".")) * 10;

  const lMatch = text.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  if (lMatch) return parseFloat(lMatch[1].replace(",", ".")) * 1000;

  return 0;
}

/** Enlève la quantité en début/fin de ligne pour ne garder que le nom. */
function cleanIngredientName(text: string): string {
  return text
    .replace(/^\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l|oz|lb|tsp|tbsp|cup|pcs?|unit[eé]?s?)\.?\s*/i, "")
    .replace(/[-–·•]\s*\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l)\.?$/i, "")
    .replace(/\s+\d+(?:[.,]\d+)?\s*(kg|g|ml|cl|l)$/i, "")
    .replace(/^\d+\s*\/\s*\d+\s*/, "")
    .replace(/^\d+\s+/, "")
    .trim();
}
