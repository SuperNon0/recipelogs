/**
 * Fournisseurs : calculs sans base de données (prix ramené à l'unité,
 * évolution, moyenne, tableau comparatif). Testé dans tests/suppliers.test.ts.
 */
import { PRICE_UNITS, type PriceUnit } from "./cost";

/** Familles proposées pour ranger le tableau comparatif (on peut en écrire d'autres). */
export const SUPPLIER_FAMILIES = [
  "Chocolat",
  "Crèmerie et œufs",
  "Épicerie",
  "Fruits et légumes",
  "Fruits secs",
  "Surgelés",
  "Viande et poisson",
  "Boissons",
  "Emballages",
  "Matériel",
] as const;

export const OTHER_FAMILY = "Autres";

/** Clé de regroupement d'un article : sans casse, accents ni espaces en trop. */
export function articleKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/gi, "oe")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Prix d'une ligne de bon ramené à l'unité de prix (€ par kg, L ou pièce).
 * Dans l'ordre : le prix unitaire donné, sinon le prix d'un colis ÷ sa
 * contenance, sinon le montant de la ligne ÷ (nombre de colis × contenance).
 */
export function unitPriceOf(line: {
  unitPrice?: number | null;
  packPrice?: number | null;
  packSize?: number | null;
  quantity?: number | null;
  lineTotal?: number | null;
}): number | null {
  const ok = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;
  if (ok(line.unitPrice)) return round4(line.unitPrice);
  const size = ok(line.packSize) ? line.packSize : 1;
  if (ok(line.packPrice)) return round4(line.packPrice / size);
  if (ok(line.lineTotal) && ok(line.quantity)) return round4(line.lineTotal / (line.quantity * size));
  return null;
}

export type PricePoint = { date: Date | string; price: number; unit: string };

export type PriceStats = {
  current: number;
  unit: string;
  date: string;
  /** Prix du bon précédent (même unité), s'il y en a un. */
  previous: number | null;
  /** Évolution en % depuis le bon précédent, arrondie (+6 = hausse de 6 %). */
  changePct: number | null;
  /** Moyenne des prix payés (même unité). */
  average: number;
  /** Nombre de bons où l'article apparaît. */
  count: number;
};

const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

/** Dernier prix, précédent, évolution et moyenne d'après l'historique (dans n'importe quel ordre). */
export function priceStats(history: PricePoint[]): PriceStats | null {
  if (history.length === 0) return null;
  // Du plus récent au plus ancien ; à date égale, l'ordre donné est gardé (dernier saisi d'abord).
  const sorted = history
    .map((h, i) => ({ ...h, i }))
    .sort((a, b) => iso(b.date).localeCompare(iso(a.date)) || b.i - a.i);
  const last = sorted[0];
  const same = sorted.filter((h) => h.unit === last.unit);
  const previous = same[1]?.price ?? null;
  const changePct = previous && previous > 0 ? Math.round(((last.price - previous) / previous) * 100) : null;
  const average = round4(same.reduce((s, h) => s + h.price, 0) / same.length);
  return { current: last.price, unit: last.unit, date: iso(last.date), previous, changePct, average, count: same.length };
}

export type ComparisonProduct = {
  id: number;
  supplierId: number;
  name: string;
  article: string | null;
  family: string | null;
  packLabel: string | null;
  unit: string;
  stats: PriceStats | null;
};

export type ComparisonCell = {
  productId: number;
  name: string;
  packLabel: string | null;
  price: number;
  unit: string;
  date: string;
  changePct: number | null;
  average: number;
};

export type ComparisonRow = {
  key: string;
  article: string;
  family: string;
  unit: string;
  /** Une case par fournisseur (id → prix), absente s'il n'a pas l'article. */
  cells: Record<number, ComparisonCell>;
  /** Nombre de bons où l'article apparaît, tous fournisseurs confondus. */
  orders: number;
};

/**
 * Lignes du tableau comparatif : un article par ligne (même nom d'article
 * chez plusieurs fournisseurs), rangées par famille puis par nom. Chez un même
 * fournisseur, si deux produits portent le même article, le moins cher compte.
 */
export function buildComparison(products: ComparisonProduct[]): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  for (const p of products) {
    if (!p.stats) continue;
    const article = (p.article?.trim() || p.name).trim();
    const unit = p.stats.unit;
    // Deux unités différentes ne se comparent pas : une ligne par unité.
    const key = `${articleKey(article)}|${unit}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, article, family: p.family?.trim() || OTHER_FAMILY, unit, cells: {}, orders: 0 };
      rows.set(key, row);
    } else if (row.family === OTHER_FAMILY && p.family?.trim()) {
      row.family = p.family.trim();
    }
    row.orders += p.stats.count;
    const cell: ComparisonCell = {
      productId: p.id,
      name: p.name,
      packLabel: p.packLabel,
      price: p.stats.current,
      unit,
      date: p.stats.date,
      changePct: p.stats.changePct,
      average: p.stats.average,
    };
    const prev = row.cells[p.supplierId];
    if (!prev || cell.price < prev.price) row.cells[p.supplierId] = cell;
  }
  const familyRank = (f: string) => {
    const i = (SUPPLIER_FAMILIES as readonly string[]).indexOf(f);
    return i >= 0 ? i : f === OTHER_FAMILY ? 1000 : 500;
  };
  return [...rows.values()].sort(
    (a, b) =>
      familyRank(a.family) - familyRank(b.family) ||
      a.family.localeCompare(b.family, "fr") ||
      a.article.localeCompare(b.article, "fr", { sensitivity: "base" }),
  );
}

/** Prix le plus bas parmi les fournisseurs montrés (null s'il n'y en a qu'un ou aucun). */
export function bestPrice(row: ComparisonRow, supplierIds: number[]): number | null {
  const prices = supplierIds.map((id) => row.cells[id]?.price).filter((p): p is number => p != null);
  return prices.length > 1 ? Math.min(...prices) : null;
}

/** « sac 25 kg », « carton de 50 » : contenance lisible d'un colis. */
export function packLabel(packSize: number | null, unit: string): string | null {
  if (packSize == null || !(packSize > 0) || packSize === 1) return null;
  const n = packSize.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
  return unit === "pièce" ? `colis de ${n}` : `colis de ${n} ${unit}`;
}

export function isPriceUnitLoose(u: unknown): u is PriceUnit {
  return PRICE_UNITS.includes(u as PriceUnit);
}
