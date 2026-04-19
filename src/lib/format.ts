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
