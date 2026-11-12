import { ingMass } from "./massAdjust";

/** Unités de prix d'achat d'un ingrédient. */
export const PRICE_UNITS = ["kg", "L", "pièce"] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

/** Prix d'achat d'un ingrédient : `price` € par `unit`. */
export type IngredientPrice = { price: number; unit: PriceUnit };

/** Coefficient de vente proposé quand la recette n'en a pas. */
export const DEFAULT_SALE_COEF = 4;

export function isPriceUnit(u: unknown): u is PriceUnit {
  return PRICE_UNITS.includes(u as PriceUnit);
}

type CostLine = {
  name: string;
  quantityG: number;
  quantityGMax?: number | null;
  unit?: string | null;
  pieceG?: number | null;
  cost?: IngredientPrice | null;
};

/**
 * Coût d'une ligne d'ingrédient (quantité déjà mise à l'échelle), en €.
 * - prix au kg ou au L : sur la masse en grammes (1 L compté ≈ 1 kg) ;
 * - prix à la pièce : nombre de pièces, ou masse ÷ poids d'une pièce ;
 * - QS : 0 € ; prix inconnu ou impossible à convertir : null.
 * Une fourchette est comptée à sa moyenne, comme la masse affichée.
 */
export function lineCost(ing: CostLine): number | null {
  const unit = ing.unit ?? "g";
  if (unit === "QS" || unit === "titre") return 0;
  if (!ing.cost) return null;
  const qty = (ing.quantityG + (ing.quantityGMax ?? ing.quantityG)) / 2;
  const { price, unit: pu } = ing.cost;
  if (pu === "pièce") {
    if (unit === "pièce") return qty * price;
    const g = ingMass(qty, unit);
    return ing.pieceG && ing.pieceG > 0 && g > 0 ? (g / ing.pieceG) * price : null;
  }
  const g = ingMass(qty, unit, ing.pieceG);
  if (g === 0 && qty > 0) return null; // pièce sans poids connu : on ne sait pas convertir
  return (g / 1000) * price;
}

/** Coût total d'une liste d'ingrédients et ceux dont le prix manque. */
export function costOf(lines: CostLine[]): { total: number; missing: string[]; detail: { name: string; cost: number }[] } {
  let total = 0;
  const missing: string[] = [];
  const detail: { name: string; cost: number }[] = [];
  for (const l of lines) {
    const c = lineCost(l);
    if (c == null) {
      if (!missing.includes(l.name)) missing.push(l.name);
      continue;
    }
    total += c;
    if (c > 0) detail.push({ name: l.name, cost: c });
  }
  return { total, missing, detail };
}

/** « 12,40 € » ; sous 1 € on garde 3 décimales utiles (« 0,315 € »). */
export function formatEuro(v: number): string {
  const digits = Math.abs(v) < 1 && v !== 0 ? 3 : 2;
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: digits }) + " €";
}

/** TVA proposées pour le prix de vente, en % (0 = prix déjà HT). */
export const SALE_VATS = [5.5, 10, 20, 0] as const;
/** TVA par défaut : vente à emporter de pâtisserie. */
export const DEFAULT_SALE_VAT = 5.5;

/**
 * Marge sur un prix de vente.
 * - `price` : prix de vente tel qu'affiché au client, TVA `vat` % comprise (0 = HT) ;
 * - `cost` : coût matière de ce qui est vendu (une pièce, ou la recette entière).
 * La marge se calcule sur le prix HT : la TVA n'est pas gardée.
 * `rate` = marge ÷ prix HT × 100 ; `coef` = prix de vente ÷ coût matière.
 */
export function saleMargin(price: number, vat: number, cost: number): { priceHT: number; margin: number; rate: number | null; coef: number | null } {
  const priceHT = price / (1 + (vat > 0 ? vat : 0) / 100);
  const margin = priceHT - cost;
  return {
    priceHT,
    margin,
    rate: priceHT > 0 ? (margin / priceHT) * 100 : null,
    coef: cost > 0 ? price / cost : null,
  };
}

/** « 5,5 % » ou « HT ». */
export function formatVat(vat: number): string {
  return vat > 0 ? `TTC ${vat.toLocaleString("fr-FR")} %` : "HT";
}
