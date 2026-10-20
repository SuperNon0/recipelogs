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

/** Formate une quantité avec décimales visibles (ex: 166,67 g). */
export function formatGDecimal(value: number, opts?: { forceG?: boolean }): string {
  if (!Number.isFinite(value)) return "0 g";
  if (!opts?.forceG && value >= 1000) {
    return (
      (value / 1000).toLocaleString("fr-FR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      }) + " kg"
    );
  }
  return (
    value.toLocaleString("fr-FR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }) + " g"
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

/** Quantité + unité lisible : « 250 g », « 1,2 kg », « 2 cc », « QS ». */
export function formatQty(qty: number, unit: string | null | undefined): string {
  if (unit === "QS") return "QS";
  if (!unit || unit === "g") return formatG(qty);
  return qty.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + unit;
}
