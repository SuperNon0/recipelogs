/** Masse en grammes d'une quantité selon son unité. */
export function ingMass(q: number, unit: string): number {
  if (!unit || unit === "g") return q;
  if (unit === "cc") return q * 5;
  if (unit === "cs") return q * 15;
  if (unit === "L") return q * 1000;
  return 0;
}

/** Applique un coefficient à une quantité — Math.ceil + L converti en g entier. */
export function scaleQty(
  qty: number,
  unit: string,
  coef: number,
): { quantityG: number; unit: string } {
  if (unit === "L") return { quantityG: Math.ceil(qty * coef * 1000), unit: "g" };
  return { quantityG: Math.ceil(qty * coef), unit };
}

/**
 * Masse totale d'une liste d'ingrédients — SEULE source de vérité du calcul.
 * - g, cc (≈5 g), cs (≈15 g), L (×1000) comptent ; pièce et QS sont exclus.
 * - Fourchettes : `min` utilise quantityG, `max` utilise quantityGMax,
 *   `avg` est la moyenne des deux (valeur affichée comme « masse totale »).
 */
export function recipeMass(
  ingredients: { quantityG: number | string | { toString(): string }; quantityGMax?: number | string | { toString(): string } | null; unit?: string | null }[],
): { min: number; max: number; avg: number } {
  let min = 0;
  let max = 0;
  for (const i of ingredients) {
    const unit = i.unit ?? "g";
    const q = Number(i.quantityG);
    const qMax = i.quantityGMax != null ? Number(i.quantityGMax) : q;
    min += ingMass(q, unit);
    max += ingMass(qMax, unit);
  }
  return { min, max, avg: (min + max) / 2 };
}

/** Unité affichée après scaling (L → g, le reste inchangé). */
export function scaledUnit(unit: string | undefined | null): string {
  if (unit === "L") return "g";
  return unit ?? "g";
}

export type AdjIngredient = {
  name: string;
  quantityG: number;
  quantityGMax: number | null;
  unit: string;
};

/**
 * Après arrondi au supérieur, répartit l'écart ±N g sur les ingrédients
 * en grammes (les plus gros en premier) pour atteindre exactement targetMassG.
 */
export function adjustToTarget(
  ingredients: AdjIngredient[],
  targetMassG: number,
): { ingredients: AdjIngredient[]; totalMassGMin: number; totalMassGMax: number } {
  const result = ingredients.map((i) => ({ ...i }));

  const total = result.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
  let diff = Math.round(total - targetMassG);

  if (diff !== 0) {
    const gIdx = result
      .map((ing, idx) => ({ idx, qty: ing.quantityG, unit: ing.unit ?? "g" }))
      .filter(({ unit }) => !unit || unit === "g")
      .sort((a, b) => b.qty - a.qty);

    if (gIdx.length > 0) {
      let i = 0;
      const maxIter = Math.abs(diff) * gIdx.length + gIdx.length;
      while (diff !== 0 && i < maxIter) {
        const { idx } = gIdx[i % gIdx.length];
        if (diff > 0 && result[idx].quantityG > 1) {
          result[idx] = { ...result[idx], quantityG: result[idx].quantityG - 1 };
          diff--;
        } else if (diff < 0) {
          result[idx] = { ...result[idx], quantityG: result[idx].quantityG + 1 };
          diff++;
        }
        i++;
      }
    }
  }

  const totalMassGMin = result.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
  const totalMassGMax = result.reduce(
    (s, i) => s + ingMass(i.quantityGMax != null ? i.quantityGMax : i.quantityG, i.unit),
    0,
  );
  return { ingredients: result, totalMassGMin, totalMassGMax };
}
