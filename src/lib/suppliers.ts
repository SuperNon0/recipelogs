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
  /** Tous les prix payés (pour regrouper les variantes d'un même article). */
  history?: (PricePoint & { orderId?: number })[];
};

/** Nom sous lequel un produit est rangé : son article, sinon son nom. */
export const articleOf = (p: { name: string; article: string | null }) => (p.article?.trim() || p.name).trim();

/** Un prix payé, avec le produit (la désignation écrite sur la facture) d'où il vient. */
export type ArticleHistoryEntry<H> = H & { productId: number; productName: string };

/**
 * Article d'un fournisseur : toutes ses variantes (« Fraise France »,
 * « Fraise Espagne ») réunies, avec un seul historique de prix.
 */
export type ArticleGroup<P extends ComparisonProduct> = {
  key: string;
  article: string;
  family: string;
  unit: string;
  /** Les variantes, de la plus récemment achetée à la plus ancienne. */
  products: P[];
  /** Tous les prix, du plus récent au plus ancien. */
  history: ArticleHistoryEntry<NonNullable<P["history"]>[number]>[];
  stats: PriceStats | null;
};

const groupKey = (p: Pick<ComparisonProduct, "name" | "article" | "unit" | "stats">) =>
  `${articleKey(articleOf(p))}|${p.stats?.unit ?? p.unit}`;

/**
 * Regroupe les produits d'UN fournisseur par article (même nom d'article,
 * même unité de prix). Les prix de toutes les variantes forment un seul
 * historique : dernier prix, évolution et moyenne valent pour l'article.
 */
export function groupByArticle<P extends ComparisonProduct>(products: P[]): ArticleGroup<P>[] {
  const groups = new Map<string, ArticleGroup<P>>();
  for (const p of products) {
    const key = groupKey(p);
    let g = groups.get(key);
    if (!g) {
      g = { key, article: articleOf(p), family: p.family?.trim() || OTHER_FAMILY, unit: p.stats?.unit ?? p.unit, products: [], history: [], stats: null };
      groups.set(key, g);
    } else if (g.family === OTHER_FAMILY && p.family?.trim()) {
      g.family = p.family.trim();
    }
    g.products.push(p);
    for (const h of (p.history ?? []) as NonNullable<P["history"]>) g.history.push({ ...h, productId: p.id, productName: p.name });
  }
  for (const g of groups.values()) {
    g.history.sort((a, b) => iso(b.date).localeCompare(iso(a.date)) || (b.orderId ?? 0) - (a.orderId ?? 0));
    const anyHistory = g.products.some((p) => p.history);
    if (anyHistory) {
      g.stats = priceStats(g.history.slice().reverse());
    } else {
      // Sans historique détaillé : le prix le plus récent, puis le moins cher.
      const best = g.products
        .map((p) => p.stats)
        .filter((s): s is PriceStats => s != null)
        .sort((a, b) => b.date.localeCompare(a.date) || a.current - b.current)[0];
      g.stats = best ?? null;
    }
    const lastDate = (p: P) => p.stats?.date ?? "";
    g.products.sort((a, b) => lastDate(b).localeCompare(lastDate(a)) || (a.stats?.current ?? 0) - (b.stats?.current ?? 0));
  }
  return [...groups.values()].sort((a, b) => a.article.localeCompare(b.article, "fr", { sensitivity: "base" }));
}

export type ComparisonCell = {
  /** La variante achetée le plus récemment. */
  productId: number;
  /** Toutes les variantes de cet article chez ce fournisseur. */
  productIds: number[];
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
 * fournisseur, les variantes de l'article sont réunies : la case montre le
 * dernier prix payé (à date égale, le moins cher).
 */
export function buildComparison(products: ComparisonProduct[]): ComparisonRow[] {
  const bySupplier = new Map<number, ComparisonProduct[]>();
  for (const p of products) {
    if (!p.stats) continue;
    bySupplier.set(p.supplierId, [...(bySupplier.get(p.supplierId) ?? []), p]);
  }
  const rows = new Map<string, ComparisonRow>();
  for (const [supplierId, list] of bySupplier) {
    for (const g of groupByArticle(list)) {
      if (!g.stats) continue;
      let row = rows.get(g.key);
      if (!row) {
        row = { key: g.key, article: g.article, family: g.family, unit: g.unit, cells: {}, orders: 0 };
        rows.set(g.key, row);
      } else if (row.family === OTHER_FAMILY && g.family !== OTHER_FAMILY) {
        row.family = g.family;
      }
      row.orders += g.stats.count;
      const latest =
        g.products.find((p) => g.history[0] && p.id === g.history[0].productId) ?? g.products[0];
      row.cells[supplierId] = {
        productId: latest.id,
        productIds: g.products.map((p) => p.id),
        name: latest.name,
        packLabel: latest.packLabel,
        price: g.stats.current,
        unit: g.unit,
        date: g.stats.date,
        changePct: g.stats.changePct,
        average: g.stats.average,
      };
    }
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

/** Contenance lue dans la désignation d'un produit (poids, volume, nombre par colis). */
export type PackagingFound = {
  /** Poids ou volume lu, ramené en kg ou L (le poids net égoutté « PNE » d'abord). */
  amount: { value: number; unit: "kg" | "L"; drained: boolean } | null;
  /** « x 50 », « x50 » : nombre d'unités dans le colis. */
  count: number | null;
};

const frNum = (s: string) => Number(s.replace(",", "."));

/**
 * Lit la contenance écrite dans une désignation de facture : « boîte 4,2 kg
 * PNE 2,4 kg » → 2,4 kg égoutté ; « 700 ml » → 0,7 L ; « 16 x 8 x 50 » → 50.
 */
export function readPackaging(name: string): PackagingFound {
  const s = ` ${name.toLowerCase()} `;
  const amounts: { value: number; unit: "kg" | "L"; drained: boolean; at: number }[] = [];
  const re = /(pne|p\.n\.e\.?|égoutté|egoutte)?\s*:?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|l|cl|ml)(?![a-zà-ÿ])/g;
  for (let m; (m = re.exec(s)); ) {
    const v = frNum(m[2]);
    if (!(v > 0)) continue;
    const u = m[3];
    const value = u === "kg" || u === "l" ? v : u === "g" || u === "ml" ? v / 1000 : v / 100;
    amounts.push({ value: Math.round(value * 10000) / 10000, unit: u === "kg" || u === "g" ? "kg" : "L", drained: !!m[1], at: m.index });
  }
  const drained = amounts.find((a) => a.drained);
  const first = drained ?? amounts[0];
  const counts = [...s.matchAll(/(?:^|[\s\d])x\s*(\d{1,4})(?![\d.,]|\s*(?:cm|mm|m)\b)/g)].map((m) => Number(m[1]));
  const count = counts.length ? counts[counts.length - 1] : null;
  return {
    amount: first ? { value: first.value, unit: first.unit, drained: first.drained } : null,
    count: count && count > 1 ? count : null,
  };
}

/**
 * Ligne de facture à vérifier : prix « à la pièce » alors que la désignation
 * donne un poids, un volume ou un nombre par colis, sans contenance indiquée.
 * Renvoie une phrase pour Claude / l'utilisateur, ou null si tout va bien.
 */
export function packagingWarning(line: { product: string; unit: string; packSize?: number | null }): string | null {
  if (line.unit !== "pièce" || (line.packSize != null && line.packSize > 1)) return null;
  const p = readPackaging(line.product);
  if (p.count) {
    return `${line.product} : colis de ${p.count} ? Si le prix est celui du colis, mets contenance = ${p.count} (prix par pièce calculé).`;
  }
  if (p.amount && p.amount.value >= 1) {
    const what = p.amount.drained ? "poids net égoutté" : p.amount.unit === "kg" ? "poids" : "volume";
    return `${line.product} : ${what} ${p.amount.value.toLocaleString("fr-FR")} ${p.amount.unit} lu dans la désignation. Préfère unite_prix = ${p.amount.unit} avec contenance = ${p.amount.value} pour un prix au ${p.amount.unit} comparable.`;
  }
  return null;
}
