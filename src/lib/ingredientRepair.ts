import { ingMass } from "./massAdjust";
import { isQuantityOnly } from "./parseIngredientsText";

/**
 * Réparation des recettes importées (Recipe Keeper) dont la quantité a été
 * enregistrée comme un ingrédient à part :
 *
 *   « Abricots frais » 0 g      →   « Abricots frais » 800 g
 *   « 800g »          800 g          (ligne « 800g » supprimée)
 *
 * et la ligne « Total » recopiée comme dernier ingrédient (« 500g » à la fin,
 * égal à la somme des autres) : elle est supprimée pour ne pas doubler la masse.
 *
 * Calcul pur : renvoie les modifications à appliquer, sans toucher à la base.
 */

export type RepairIngredient = {
  id: number;
  name: string;
  quantityG: number;
  quantityGMax: number | null;
  unit: string;
};

export type RepairPlan = {
  /** Ingrédients qui reçoivent la quantité de la ligne suivante. */
  updates: { id: number; quantityG: number; quantityGMax: number | null; unit: string }[];
  /** Lignes « quantité seule » absorbées par l'ingrédient précédent, ou lignes de total. */
  deletes: number[];
};

/** Ingrédient sans quantité (0 g, pas de fourchette) : attend sa quantité. */
function isEmpty(i: RepairIngredient): boolean {
  return i.quantityG === 0 && i.quantityGMax == null && (i.unit === "g" || !i.unit);
}

/** Les ingrédients doivent être dans l'ordre de la recette (position). */
export function planIngredientRepair(ingredients: RepairIngredient[]): RepairPlan {
  const plan: RepairPlan = { updates: [], deletes: [] };
  for (let k = 1; k < ingredients.length; k++) {
    const prev = ingredients[k - 1];
    const cur = ingredients[k];
    if (
      isQuantityOnly(cur.name) &&
      cur.quantityG > 0 &&
      isEmpty(prev) &&
      !isQuantityOnly(prev.name) &&
      !plan.deletes.includes(prev.id)
    ) {
      plan.updates.push({ id: prev.id, quantityG: cur.quantityG, quantityGMax: cur.quantityGMax, unit: cur.unit });
      plan.deletes.push(cur.id);
    }
  }

  // Dernière ligne « quantité seule » égale à la somme des autres = ligne de total.
  const last = ingredients[ingredients.length - 1];
  if (last && ingredients.length > 2 && isQuantityOnly(last.name) && !plan.deletes.includes(last.id)) {
    const updated = new Map(plan.updates.map((u) => [u.id, u]));
    const sum = ingredients
      .slice(0, -1)
      .filter((i) => !plan.deletes.includes(i.id))
      .reduce((s, i) => {
        const u = updated.get(i.id) ?? i;
        return s + ingMass(u.quantityG, u.unit);
      }, 0);
    const total = ingMass(last.quantityG, last.unit);
    if (total > 0 && Math.abs(total - sum) <= Math.max(2, total * 0.02)) plan.deletes.push(last.id);
  }
  return plan;
}

/**
 * Même réparation sur une liste d'ingrédients analysée à l'import (avant
 * l'enregistrement) : quantités recollées, ligne de total retirée.
 */
export function cleanParsedIngredients<T extends { name: string; quantityG: number; quantityGMax?: number | null; unit: string }>(
  list: T[],
): T[] {
  const plan = planIngredientRepair(
    list.map((i, id) => ({ id, name: i.name, quantityG: i.quantityG, quantityGMax: i.quantityGMax ?? null, unit: i.unit })),
  );
  const updates = new Map(plan.updates.map((u) => [u.id, u]));
  return list
    .map((i, id) => {
      const u = updates.get(id);
      return u ? { ...i, quantityG: u.quantityG, quantityGMax: u.quantityGMax ?? undefined, unit: u.unit } : i;
    })
    .filter((_, id) => !plan.deletes.includes(id));
}
