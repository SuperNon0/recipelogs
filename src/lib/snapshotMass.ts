import { adjustToTarget, ingMass, recipeMass, scaleQty, type AdjIngredient } from "./massAdjust";

type Ingredient = Omit<AdjIngredient, "quantityGMax" | "unit"> & { quantityGMax?: number | null; unit?: string };
type Group = { ingredients: Ingredient[]; totalMassG: number; isLocked?: boolean; fixedIngredients?: boolean[]; coef?: number; [key: string]: unknown };
export type MassSnapshot = {
  ingredients: Ingredient[]; totalMassG: number; subRecipes?: Group[];
  multiplier?: number; yield?: { count: number; label: string } | null;
  [key: string]: unknown;
};
export type SnapshotMassPayload =
  | { mode: "coefficient"; coefficient: number }
  | { mode: "mass_target"; targetMassG: number; forceExact?: boolean }
  | { mode: "pivot_ingredient"; pivotIndex: number; targetMassG: number };

function groups(snap: MassSnapshot) {
  return [{ ingredients: snap.ingredients, fixed: snap.ingredients.map(() => false) },
    ...(snap.subRecipes ?? []).map((sr) => ({ ingredients: sr.ingredients,
      fixed: sr.ingredients.map((_, i) => sr.isLocked === true || sr.fixedIngredients?.[i] === true) }))];
}

export function snapshotMassInfo(snap: MassSnapshot): { totalMassG: number; fixedMassG: number } {
  let totalMassG = 0;
  let fixedMassG = 0;
  for (const group of groups(snap)) {
    totalMassG += recipeMass(group.ingredients).avg;
    fixedMassG += recipeMass(group.ingredients.filter((_, i) => group.fixed[i])).avg;
  }
  return { totalMassG, fixedMassG };
}

export function resizeSnapshot(snap: MassSnapshot, payload: SnapshotMassPayload): MassSnapshot {
  const { totalMassG, fixedMassG } = snapshotMassInfo(snap);
  let ratio: number;
  if (payload.mode === "coefficient") {
    if (!Number.isFinite(payload.coefficient) || payload.coefficient <= 0) throw new Error("Coefficient invalide.");
    ratio = payload.coefficient;
  } else {
    if (!Number.isFinite(payload.targetMassG) || payload.targetMassG <= 0) throw new Error("Masse cible invalide.");
    if (payload.mode === "mass_target") {
      if (payload.targetMassG < fixedMassG) throw new Error("La cible est inférieure à la masse des sous-recettes verrouillées.");
      const free = totalMassG - fixedMassG;
      if (free <= 0 && payload.targetMassG !== totalMassG) throw new Error("Aucun ingrédient libre ne permet de modifier cette masse.");
      ratio = free > 0 ? (payload.targetMassG - fixedMassG) / free : 1;
    } else {
      const pivot = snap.ingredients[payload.pivotIndex];
      const mass = pivot && ingMass(pivot.quantityG, pivot.unit ?? "g", pivot.pieceG);
      if (!mass || mass <= 0) throw new Error("Ingrédient pivot sans masse connue.");
      ratio = payload.targetMassG / mass;
    }
  }
  const scaled = groups(snap).map((group) => ({ ...group, ingredients: group.ingredients.map((ing, i) => {
    if (group.fixed[i]) return { ...ing, quantityGMax: ing.quantityGMax ?? null, unit: ing.unit ?? "g" };
    const q = scaleQty(ing.quantityG, ing.unit ?? "g", ratio);
    return { ...ing, ...q, quantityGMax: ing.quantityGMax != null ? scaleQty(ing.quantityGMax, ing.unit ?? "g", ratio).quantityG : null };
  }) }));
  if (payload.mode === "mass_target" && payload.forceExact) {
    const free = scaled.flatMap((g) => g.ingredients.filter((_, i) => !g.fixed[i]));
    const adjusted = adjustToTarget(free, payload.targetMassG - fixedMassG).ingredients;
    if (Math.abs(recipeMass(adjusted).avg + fixedMassG - payload.targetMassG) > 0.5) {
      throw new Error("Masse exacte impossible avec les unités et les ingrédients verrouillés actuels.");
    }
    let cursor = 0;
    for (const group of scaled) group.ingredients = group.ingredients.map((ing, i) => group.fixed[i] ? ing : { ...ing, ...adjusted[cursor++] });
  }
  const totals = (ingredients: Ingredient[]) => {
    const { min, max, avg } = recipeMass(ingredients);
    return { totalMassG: avg, totalMassGMin: min, totalMassGMax: max };
  };
  return {
    ...snap, ingredients: scaled[0].ingredients, ...totals(scaled[0].ingredients),
    subRecipes: (snap.subRecipes ?? []).map((sr, i) => ({ ...sr, ingredients: scaled[i + 1].ingredients,
      ...totals(scaled[i + 1].ingredients), ...(typeof sr.coef === "number" && !sr.isLocked ? { coef: sr.coef * ratio } : {}) })),
    multiplier: (snap.multiplier ?? 1) * ratio,
    yield: snap.yield ? { ...snap.yield, count: Math.round(snap.yield.count * ratio * 10) / 10 } : snap.yield,
  };
}
