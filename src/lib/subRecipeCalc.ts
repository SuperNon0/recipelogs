import { adjustToTarget, ingMass, recipeMass, type AdjIngredient } from "./massAdjust";

/**
 * Calcule le coefficient local effectif d'une sous-recette
 * selon son mode et les ingrédients de la recette enfant.
 */
export function computeLocalCoef(
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient",
  calcValue: number,
  childBaseTotalG: number,
  pivotBaseQtyG: number | null,
): number {
  if (calcMode === "coefficient") {
    return Number.isFinite(calcValue) && calcValue > 0 ? calcValue : 1;
  }
  if (calcMode === "mass_target") {
    if (childBaseTotalG <= 0) return 1;
    return calcValue / childBaseTotalG;
  }
  // pivot_ingredient
  if (!pivotBaseQtyG || pivotBaseQtyG <= 0) return 1;
  return calcValue / pivotBaseQtyG;
}

export type SubRecipeCalcInput = {
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient";
  calcValue: number;
  pivotIngredientId: number | null;
  isExact: boolean;
  childIngredients: { id: number; name: string; quantityG: number; quantityGMax?: number | null; unit?: string }[];
};

/**
 * Quantités d'une sous-recette pour un multiplicateur global donné.
 * - Verrouillée : seul son propre réglage compte (le multiplicateur est ignoré).
 * - Quantités arrondies au gramme supérieur ; L converti en g.
 * - « Masse exacte » (mode masse cible) : écart d'arrondi réparti pour tomber pile.
 */
export function computeSubRecipe(
  sr: SubRecipeCalcInput,
  globalCoef: number,
  locked: boolean,
): { effectiveCoef: number; ingredients: AdjIngredient[]; min: number; max: number } {
  const base = recipeMass(sr.childIngredients).avg;
  // Le pivot est une masse voulue en grammes : convertir la quantité du pivot
  // en grammes (ingMass gère L/cc/cs) avant d'en déduire le coefficient.
  const pivotIng = sr.pivotIngredientId
    ? sr.childIngredients.find((i) => i.id === sr.pivotIngredientId)
    : null;
  const pivotQty = pivotIng ? ingMass(pivotIng.quantityG, pivotIng.unit ?? "g") : null;
  const localCoef = computeLocalCoef(sr.calcMode, sr.calcValue, base, pivotQty);
  const effectiveCoef = locked ? localCoef : localCoef * globalCoef;

  let ingredients: AdjIngredient[] = sr.childIngredients.map((ing) => {
    const unit = ing.unit === "L" ? "g" : (ing.unit ?? "g");
    const k = ing.unit === "L" ? effectiveCoef * 1000 : effectiveCoef;
    return {
      name: ing.name,
      quantityG: Math.ceil(ing.quantityG * k),
      quantityGMax: ing.quantityGMax != null ? Math.ceil(ing.quantityGMax * k) : null,
      unit,
    };
  });
  if (sr.isExact && sr.calcMode === "mass_target") {
    ingredients = adjustToTarget(ingredients, Math.round(sr.calcValue * (locked ? 1 : globalCoef))).ingredients;
  }
  const min = ingredients.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
  const max = ingredients.reduce((s, i) => s + ingMass(i.quantityGMax ?? i.quantityG, i.unit), 0);
  return { effectiveCoef, ingredients, min, max };
}
