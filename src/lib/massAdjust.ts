/**
 * Masse en grammes d'une quantité selon son unité. Une pièce ne compte que si
 * l'ingrédient a un poids par pièce (`pieceG`, réglé sur sa fiche) ; QS jamais.
 */
export function ingMass(q: number, unit: string, pieceG?: number | null): number {
  if (!unit || unit === "g") return q;
  if (unit === "cc") return q * 5;
  if (unit === "cs") return q * 15;
  if (unit === "L") return q * 1000;
  if (unit === "pièce" && pieceG && pieceG > 0) return q * pieceG;
  return 0;
}

/**
 * Arrondi d'une quantité multipliée : au gramme supérieur, sauf les pièces,
 * arrondies à la pièce la plus proche (5,06 jaunes → 5, et non 6 ; au moins 1).
 */
export function roundScaled(x: number, unit: string | null | undefined): number {
  if (unit === "pièce") return x > 0 ? Math.max(1, Math.round(x)) : 0;
  return Math.ceil(x);
}

/**
 * Applique un coefficient à une quantité. Quand on multiplie (coef ≠ 1) : arrondi
 * au gramme supérieur. Quand on ne multiplie pas (×1) : valeur exacte conservée,
 * pour ne pas arrondir en silence une recette affichée telle quelle. L → g.
 */
export function scaleQty(
  qty: number,
  unit: string,
  coef: number,
): { quantityG: number; unit: string } {
  const round = coef === 1 ? (x: number) => x : (x: number) => roundScaled(x, unit);
  if (unit === "L") return { quantityG: round(qty * coef * 1000), unit: "g" };
  return { quantityG: round(qty * coef), unit };
}

/**
 * Masse totale d'une liste d'ingrédients — SEULE source de vérité du calcul.
 * - g, cc (≈5 g), cs (≈15 g), L (×1000) comptent ; une pièce compte si son
 *   poids est connu (`pieceG`) ; QS est exclu.
 * - Fourchettes : `min` utilise quantityG, `max` utilise quantityGMax,
 *   `avg` est la moyenne des deux (valeur affichée comme « masse totale »).
 */
export function recipeMass(
  ingredients: { quantityG: number | string | { toString(): string }; quantityGMax?: number | string | { toString(): string } | null; unit?: string | null; pieceG?: number | null }[],
): { min: number; max: number; avg: number } {
  let min = 0;
  let max = 0;
  for (const i of ingredients) {
    const unit = i.unit ?? "g";
    const q = Number(i.quantityG);
    const qMax = i.quantityGMax != null ? Number(i.quantityGMax) : q;
    min += ingMass(q, unit, i.pieceG);
    max += ingMass(qMax, unit, i.pieceG);
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
  /** Poids d'une pièce en g (unité « pièce » seulement), s'il est connu. */
  pieceG?: number | null;
};

/** Au-dessous de ce poids, un ingrédient n'est jamais retouché par l'ajustement
 * (ex. gélatine, levure) : ±1 g y fausserait trop la recette. */
const ADJUST_MIN_G = 20;

/**
 * Après arrondi au supérieur, répartit l'écart ±N g sur les ingrédients
 * en grammes pour atteindre exactement targetMassG.
 *
 * - On vise la masse **affichée** (moyenne des fourchettes), pas la somme des
 *   minimums : sinon une recette à fourchette tombe à côté de la cible.
 * - On ne retouche que les **gros** ingrédients (≥ 20 g) ; les petits (gélatine,
 *   levure…) ne bougent pas. S'il n'y a que des petits, on les utilise quand même.
 * - Pour une fourchette, min et max bougent ensemble (la largeur est conservée).
 */
export function adjustToTarget(
  ingredients: AdjIngredient[],
  targetMassG: number,
): { ingredients: AdjIngredient[]; totalMassGMin: number; totalMassGMax: number } {
  const result = ingredients.map((i) => ({ ...i }));

  let diff = Math.round(recipeMass(result).avg - targetMassG);

  if (diff !== 0) {
    const grams = result
      .map((ing, idx) => ({ idx, qty: ing.quantityG, unit: ing.unit ?? "g" }))
      .filter(({ unit }) => !unit || unit === "g")
      .sort((a, b) => b.qty - a.qty);
    // En priorité les gros ingrédients ; à défaut (que des petits), tous.
    const big = grams.filter((g) => g.qty >= ADJUST_MIN_G);
    const pool = big.length > 0 ? big : grams;

    if (pool.length > 0) {
      let i = 0;
      const maxIter = Math.abs(diff) * pool.length + pool.length;
      while (diff !== 0 && i < maxIter) {
        const { idx } = pool[i % pool.length];
        const ing = result[idx];
        if (diff > 0 && ing.quantityG > 1) {
          result[idx] = {
            ...ing,
            quantityG: ing.quantityG - 1,
            quantityGMax: ing.quantityGMax != null ? ing.quantityGMax - 1 : null,
          };
          diff--;
        } else if (diff < 0) {
          result[idx] = {
            ...ing,
            quantityG: ing.quantityG + 1,
            quantityGMax: ing.quantityGMax != null ? ing.quantityGMax + 1 : null,
          };
          diff++;
        }
        i++;
      }
    }
  }

  const { min: totalMassGMin, max: totalMassGMax } = recipeMass(result);
  return { ingredients: result, totalMassGMin, totalMassGMax };
}
