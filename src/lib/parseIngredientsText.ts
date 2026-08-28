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
 *   "1 kg 200 g farine"      → { name: "farine", quantityG: 1200 } (additif)
 *   "100 gr / 200 grammes"   → forme longue reconnue
 *
 * Format multi-lignes (style fiche pâtissier) :
 *   "Farine\n- 200g\nBeurre\n- 100g"
 *   → [ {Farine, 200}, {Beurre, 100} ]
 */

export type ParsedIngredient = { name: string; quantityG: number };

// Ordre = du plus long au plus court pour éviter que "g" mange "gr"/"gramme".
// Chaque unité renvoie sa masse équivalente en grammes (1 ml ≈ 1 g pour l'eau).
const UNITS: { pattern: string; toG: number }[] = [
  { pattern: "kilogrammes?", toG: 1000 },
  { pattern: "kilos?", toG: 1000 },
  { pattern: "kg", toG: 1000 },
  { pattern: "grammes?", toG: 1 },
  { pattern: "gr", toG: 1 },
  { pattern: "g", toG: 1 },
  { pattern: "ml", toG: 1 },
  { pattern: "cl", toG: 10 },
  { pattern: "litres?", toG: 1000 },
  { pattern: "l", toG: 1000 },
];

const UNIT_UNION = UNITS.map((u) => u.pattern).join("|");
// Une occurrence "nombre + unité". `\b` en amont pour ne pas manger un chiffre
// collé à un mot précédent. En aval : lookahead qui refuse un caractère mot
// (évite que "l" matche "lait", "g" matche "gramme" déjà couvert par l'ordre).
const PAIR_RE = new RegExp(
  `(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_UNION})(?![a-zA-Zàâäéèêëïîôöùûüç])`,
  "gi",
);

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
 * ADDITIF : `"1 kg 200 g"` = 1200 g. Accepte g / gr / gramme(s) / kg /
 * kilo(s) / ml / cl / l / litre(s). Les volumes sont convertis 1:1 en g
 * (approximation eau/lait).
 */
function extractGrams(text: string): number {
  let total = 0;
  let matched = false;
  const rx = new RegExp(PAIR_RE.source, PAIR_RE.flags);
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    const value = parseFloat(m[1].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    const unit = m[2].toLowerCase();
    const spec = UNITS.find((u) => new RegExp(`^${u.pattern}$`, "i").test(unit));
    if (!spec) continue;
    total += value * spec.toG;
    matched = true;
  }
  return matched ? total : 0;
}

/** Enlève la quantité en début/fin de ligne pour ne garder que le nom. */
function cleanIngredientName(text: string): string {
  const UNIT_LONG = UNITS.map((u) => u.pattern).join("|");
  return text
    .replace(
      new RegExp(
        `^(?:\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_LONG})\\.?\\s*)+`,
        "i",
      ),
      "",
    )
    .replace(
      new RegExp(
        `[-–·•]\\s*(?:\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_LONG})\\.?\\s*)+$`,
        "i",
      ),
      "",
    )
    .replace(
      new RegExp(
        `\\s+(?:\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_LONG})\\s*)+$`,
        "i",
      ),
      "",
    )
    .replace(/^\d+\s*\/\s*\d+\s*/, "")
    .replace(/^\d+\s+/, "")
    .trim();
}
