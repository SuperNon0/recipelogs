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
  const label = unit === "pièce" && qty > 1 ? "pièces" : unit;
  return qty.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + label;
}

/** Date relative courte : « aujourd'hui », « il y a 3 j », « 2 sem. », « 4 mois », « 1 an ». */
export function formatRelativeDate(date: Date | string, now: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const days = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  if (days < 30) return `${Math.floor(days / 7)} sem.`;
  if (days < 365) return `${Math.floor(days / 30)} mois`;
  const y = Math.floor(days / 365);
  return `${y} an${y > 1 ? "s" : ""}`;
}
