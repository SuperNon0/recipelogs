/**
 * Arrondit une quantité en grammes au millième — précision pâtissière.
 * Utilisé partout où l'on écrit une quantité recalculée en base ou en snapshot,
 * pour éviter les écarts d'arrondi entre applyMultiplierToRecipe,
 * updateSnapshotMass et buildRecipeSnapshot.
 */
export function roundQty(g: number): number {
  if (!Number.isFinite(g)) return 0;
  return Math.round(g * 1000) / 1000;
}

export function formatG(value: number, opts?: { forceG?: boolean }): string {
  if (!Number.isFinite(value)) return "0 g";
  if (!opts?.forceG && value >= 1000) {
    return (
      (value / 1000).toLocaleString("fr-FR", {
        maximumFractionDigits: 2,
      }) + " kg"
    );
  }
  return (
    value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " g"
  );
}

export function formatCoef(coef: number): string {
  if (!Number.isFinite(coef)) return "×1";
  return (
    "×" +
    coef.toLocaleString("fr-FR", {
      maximumFractionDigits: 3,
    })
  );
}
