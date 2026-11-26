/**
 * Commandes aux fournisseurs : lecture du catalogue (léger, sans historique
 * des prix), enregistrement, liste et suppression des commandes.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseDay } from "./purchaseOrders";
import { articleKey, articleOf } from "./suppliers";
import { STATS_WEEKS, buyStats, offerKey, orderText, orderUnits, packNameOf, toOrderUnit, type BuyEvent, type BuyStats, type Offer } from "./supplierOrders";

const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export type CatalogProduct = {
  id: number;
  name: string;
  reference: string | null;
  article: string;
  family: string | null;
  packSize: number | null;
  packName: string;
  /** Le conditionnement est-il réglé à la main (sinon deviné) ? */
  packNameSet: boolean;
  units: string[];
  price: number | null;
  priceUnit: string;
  priceDate: string | null;
  /** Dernière quantité commandée (même unité), pour la proposer. */
  last: { quantity: number; unit: string; date: string } | null;
  /** Ce que je commande d'habitude (12 dernières semaines), dans l'unité units[0]. */
  stats: BuyStats | null;
};

/**
 * Produits d'un fournisseur pour passer une commande : une seule requête,
 * sans l'historique des prix (une mercuriale de plusieurs centaines de
 * produits reste légère à charger et à afficher).
 */
export async function loadOrderCatalog(supplierId: number) {
  const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!s) return null;
  const today = isoDay(new Date());
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - STATS_WEEKS * 7 * 86_400_000);
  const [products, recent, signature, invoiceLines, orderLines, firstInvoice, firstOrder] = await Promise.all([
    prisma.supplierProduct.findMany({
      where: { supplierId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, reference: true, article: true, family: true, packSize: true, packName: true, price: true, priceUnit: true, priceDate: true },
    }),
    prisma.supplierOrder.findMany({
      where: { supplierId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 10,
      select: { date: true, lines: { select: { productId: true, label: true, quantity: true, unit: true } } },
    }),
    getOrderSignature(),
    // Factures (pas les mercuriales ni les prix tapés à la main) des 12 dernières semaines.
    prisma.purchaseOrderLine.findMany({
      where: { quantity: { not: null }, order: { supplierId, manual: false, date: { gte: from } } },
      select: { productId: true, quantity: true, order: { select: { date: true } } },
    }),
    prisma.supplierOrderLine.findMany({
      where: { order: { supplierId, date: { gte: from } } },
      select: { productId: true, label: true, quantity: true, unit: true, order: { select: { date: true } } },
    }),
    prisma.purchaseOrder.findFirst({ where: { supplierId, manual: false }, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.supplierOrder.findFirst({ where: { supplierId }, orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const since = [firstInvoice?.date, firstOrder?.date].filter((d): d is Date => !!d).map(isoDay).sort()[0] ?? null;
  const lastByProduct = new Map<number, { quantity: number; unit: string; date: string }>();
  const lastByArticle = new Map<string, { quantity: number; unit: string; date: string }>();
  for (const o of recent) {
    for (const l of o.lines) {
      const v = { quantity: Number(l.quantity), unit: l.unit, date: isoDay(o.date) };
      if (l.productId != null) {
        if (!lastByProduct.has(l.productId)) lastByProduct.set(l.productId, v);
      } else if (!lastByArticle.has(l.label.toLowerCase())) lastByArticle.set(l.label.toLowerCase(), v);
    }
  }
  // Achats de chaque produit, ramenés à son unité de commande (carton, sac…).
  const baseOf = (p: (typeof products)[number]) => ({ name: p.name, packName: p.packName, packSize: num(p.packSize), priceUnit: p.priceUnit });
  const prodById = new Map(products.map((p) => [p.id, p]));
  const buys = new Map<number, BuyEvent[]>();
  const push = (id: number, e: BuyEvent) => buys.set(id, [...(buys.get(id) ?? []), e]);
  for (const l of invoiceLines) if (prodById.has(l.productId)) push(l.productId, { date: isoDay(l.order.date), quantity: Number(l.quantity), source: "facture" });
  const articleBuys = new Map<string, { unit: string; events: BuyEvent[] }[]>();
  for (const l of orderLines) {
    const e = { date: isoDay(l.order.date), quantity: Number(l.quantity), source: "commande" as const };
    const p = l.productId != null ? prodById.get(l.productId) : undefined;
    if (p) {
      const q = toOrderUnit(baseOf(p), e.quantity, l.unit);
      if (q != null) push(p.id, { ...e, quantity: q });
    } else if (l.productId == null) {
      const k = articleKey(l.label);
      articleBuys.set(k, [...(articleBuys.get(k) ?? []), { unit: l.unit, events: [e] }]);
    }
  }
  const catalog: CatalogProduct[] = products.map((p) => {
    const base = baseOf(p);
    return {
      id: p.id,
      name: p.name,
      reference: p.reference,
      article: articleOf(p),
      family: p.family,
      packSize: num(p.packSize),
      packName: packNameOf(base),
      packNameSet: !!p.packName?.trim(),
      units: orderUnits(base),
      price: num(p.price),
      priceUnit: p.priceUnit,
      priceDate: p.priceDate ? isoDay(p.priceDate) : null,
      last: lastByProduct.get(p.id) ?? null,
      stats: buyStats(buys.get(p.id) ?? [], today, since),
    };
  });
  // Un article à variantes (« Croissant ») : ses variantes et ce qui a été commandé sans choisir,
  // quand tout se compte dans la même unité.
  const articleStats: Record<string, { unit: string; stats: BuyStats }> = {};
  const byArticle = new Map<string, CatalogProduct[]>();
  for (const c of catalog) byArticle.set(articleKey(c.article), [...(byArticle.get(articleKey(c.article)) ?? []), c]);
  for (const [k, list] of byArticle) {
    if (list.length < 2) continue;
    const unit = list[0].units[0];
    if (list.some((c) => c.units[0] !== unit)) continue;
    const loose = (articleBuys.get(k) ?? []).filter((a) => a.unit === unit).flatMap((a) => a.events);
    const st = buyStats([...list.flatMap((c) => buys.get(c.id) ?? []), ...loose], today, since);
    if (st) articleStats[k] = { unit, stats: st };
  }
  const offers = await loadOtherOffers(supplierId, catalog, today, from);
  return {
    supplier: s,
    products: catalog,
    offers,
    lastArticles: Object.fromEntries(lastByArticle),
    articleStats,
    signature,
  };
}

/**
 * Les mêmes articles (même nom d'article, même unité de prix) chez les autres
 * fournisseurs : pour chacun, le dernier prix de la variante achetée le plus
 * récemment (comme le tableau « Comparer les prix ») et ce que j'y commande
 * d'habitude. Clé offerKey → offres du moins cher au plus cher.
 */
async function loadOtherOffers(
  supplierId: number,
  catalog: { article: string; priceUnit: string }[],
  today: string,
  from: Date,
): Promise<Record<string, Offer[]>> {
  const keys = new Set(catalog.map((c) => offerKey(c.article, c.priceUnit)));
  if (!keys.size) return {};
  const others = await prisma.supplierProduct.findMany({
    where: { supplierId: { not: supplierId }, price: { not: null } },
    select: { id: true, supplierId: true, name: true, article: true, packSize: true, packName: true, price: true, priceUnit: true, priceDate: true, supplier: { select: { name: true } } },
  });
  type P = (typeof others)[number];
  // Un article chez un fournisseur = toutes ses variantes.
  const bySlot = new Map<string, { key: string; list: P[] }>();
  for (const p of others) {
    const key = offerKey(articleOf(p), p.priceUnit);
    if (!keys.has(key)) continue;
    const slot = `${key}#${p.supplierId}`;
    const cur = bySlot.get(slot);
    if (cur) cur.list.push(p);
    else bySlot.set(slot, { key, list: [p] });
  }
  if (!bySlot.size) return {};
  const ids = [...bySlot.values()].flatMap((x) => x.list.map((p) => p.id));
  const sids = [...new Set([...bySlot.values()].map((x) => x.list[0].supplierId))];
  const [invoiceLines, orderLines, firstInvoices, firstOrders] = await Promise.all([
    prisma.purchaseOrderLine.findMany({
      where: { productId: { in: ids }, quantity: { not: null }, order: { manual: false, date: { gte: from } } },
      select: { productId: true, quantity: true, order: { select: { date: true } } },
    }),
    prisma.supplierOrderLine.findMany({
      where: { productId: { in: ids }, order: { date: { gte: from } } },
      select: { productId: true, quantity: true, unit: true, order: { select: { date: true } } },
    }),
    prisma.purchaseOrder.groupBy({ by: ["supplierId"], where: { supplierId: { in: sids }, manual: false }, _min: { date: true } }),
    prisma.supplierOrder.groupBy({ by: ["supplierId"], where: { supplierId: { in: sids } }, _min: { date: true } }),
  ]);
  const since = new Map<number, string>();
  for (const r of [...firstInvoices, ...firstOrders]) {
    if (!r._min.date) continue;
    const d = isoDay(r._min.date);
    const cur = since.get(r.supplierId);
    if (!cur || d < cur) since.set(r.supplierId, d);
  }
  const baseOf = (p: P) => ({ name: p.name, packName: p.packName, packSize: num(p.packSize), priceUnit: p.priceUnit });
  const prodById = new Map(others.map((p) => [p.id, p]));
  const buys = new Map<number, BuyEvent[]>();
  const push = (id: number, e: BuyEvent) => buys.set(id, [...(buys.get(id) ?? []), e]);
  for (const l of invoiceLines) push(l.productId, { date: isoDay(l.order.date), quantity: Number(l.quantity), source: "facture" });
  for (const l of orderLines) {
    const p = l.productId != null ? prodById.get(l.productId) : undefined;
    if (!p) continue;
    const q = toOrderUnit(baseOf(p), Number(l.quantity), l.unit);
    if (q != null) push(p.id, { date: isoDay(l.order.date), quantity: q, source: "commande" });
  }
  const out: Record<string, Offer[]> = {};
  for (const { key, list } of bySlot.values()) {
    // La variante achetée le plus récemment ; à date égale, la moins chère.
    const latest = list
      .slice()
      .sort((a, b) => (b.priceDate?.getTime() ?? 0) - (a.priceDate?.getTime() ?? 0) || Number(a.price) - Number(b.price))[0];
    const statsUnit = orderUnits(baseOf(latest))[0];
    const events = list.filter((p) => orderUnits(baseOf(p))[0] === statsUnit).flatMap((p) => buys.get(p.id) ?? []);
    (out[key] ??= []).push({
      supplierId: latest.supplierId,
      supplier: latest.supplier.name,
      productId: latest.id,
      productName: latest.name,
      price: Number(latest.price),
      unit: latest.priceUnit,
      date: latest.priceDate ? isoDay(latest.priceDate) : null,
      stats: buyStats(events, today, since.get(latest.supplierId) ?? null),
      statsUnit,
    });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.price - b.price || a.supplier.localeCompare(b.supplier, "fr"));
  return out;
}

const SIGNATURE_KEY = "orderSignature";

/** Nom de l'entreprise qui signe les commandes (« Maison Chanka »), réglé une fois. */
export async function getOrderSignature(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SIGNATURE_KEY } });
  return typeof row?.value === "string" && row.value.trim() ? row.value.trim() : null;
}

export async function setOrderSignature(v: string | null): Promise<void> {
  const value = v?.trim().slice(0, 200) ?? "";
  if (!value) await prisma.setting.deleteMany({ where: { key: SIGNATURE_KEY } });
  else await prisma.setting.upsert({ where: { key: SIGNATURE_KEY }, update: { value }, create: { key: SIGNATURE_KEY, value } });
}

export type OrderCatalog = NonNullable<Awaited<ReturnType<typeof loadOrderCatalog>>>;

export type SupplierOrderLineInput = {
  /** Produit commandé ; absent pour un article commandé sans choisir la variante. */
  productId?: number | null;
  /** Nom de l'article quand productId est absent (« Croissant »). */
  label?: string | null;
  quantity: number;
  unit: string;
};

const clean = (v: string | null | undefined, max: number) => (v == null ? null : v.trim().slice(0, max) || null);

/** Enregistre une commande. Les noms et prix sont recopiés : la commande ne change plus si le produit change. */
export async function createSupplierOrder(input: {
  supplierId: number;
  date?: string | null;
  deliveryDate?: string | null;
  /** Absente : la signature des réglages. Donnée : elle devient celle des prochaines commandes. */
  signature?: string | null;
  note?: string | null;
  addedBy?: string | null;
  lines: SupplierOrderLineInput[];
}): Promise<{ id: number }> {
  const lines = input.lines.filter((l) => Number.isFinite(l.quantity) && l.quantity > 0 && l.quantity <= 100_000);
  if (!lines.length) throw new Error("La commande est vide : choisis au moins une quantité.");
  if (lines.length > 2000) throw new Error("Trop de lignes dans une seule commande.");
  const s = await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } });
  if (!s) throw new Error("Fournisseur introuvable.");
  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is number => typeof x === "number"))];
  const products = new Map(
    (
      await prisma.supplierProduct.findMany({
        where: { id: { in: ids }, supplierId: input.supplierId },
        select: { id: true, name: true, reference: true, packName: true, packSize: true, priceUnit: true, price: true },
      })
    ).map((p) => [p.id, p]),
  );
  const data: Prisma.SupplierOrderLineCreateManyOrderInput[] = [];
  lines.forEach((l, i) => {
    const unit = clean(l.unit, 40) ?? "colis";
    if (l.productId != null) {
      const p = products.get(l.productId);
      if (!p) throw new Error(`Produit ${l.productId} introuvable chez ce fournisseur.`);
      const price = num(p.price);
      const size = num(p.packSize);
      const est = price == null ? null : unit === p.priceUnit ? price : price * (size != null && size > 0 ? size : 1);
      data.push({ productId: p.id, label: p.name, reference: p.reference, quantity: l.quantity, unit, unitPrice: est, position: i });
    } else {
      const label = clean(l.label, 300);
      if (!label) throw new Error("Ligne sans produit ni nom.");
      data.push({ productId: null, label, reference: null, quantity: l.quantity, unit, unitPrice: null, position: i });
    }
  });
  const today = isoDay(new Date());
  let signature: string | null;
  if (input.signature === undefined) signature = await getOrderSignature();
  else {
    signature = clean(input.signature, 200);
    await setOrderSignature(signature);
  }
  const order = await prisma.supplierOrder.create({
    data: {
      supplierId: input.supplierId,
      date: parseDay(input.date || today),
      deliveryDate: input.deliveryDate ? parseDay(input.deliveryDate) : null,
      signature,
      note: clean(input.note, 2000),
      addedBy: clean(input.addedBy, 200),
      lines: { createMany: { data } },
    },
    select: { id: true },
  });
  return order;
}

export async function listSupplierOrders(filter: { supplierId?: number | null; take?: number } = {}) {
  const orders = await prisma.supplierOrder.findMany({
    where: filter.supplierId ? { supplierId: filter.supplierId } : {},
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: filter.take ?? 200,
    select: {
      id: true,
      date: true,
      deliveryDate: true,
      signature: true,
      supplier: { select: { id: true, name: true } },
      lines: { select: { quantity: true, unitPrice: true } },
    },
  });
  return orders.map((o) => {
    const est = o.lines.reduce((s, l) => s + (l.unitPrice != null ? Number(l.unitPrice) * Number(l.quantity) : 0), 0);
    return {
      id: o.id,
      date: isoDay(o.date),
      deliveryDate: o.deliveryDate ? isoDay(o.deliveryDate) : null,
      signature: o.signature,
      supplier: o.supplier.name,
      supplierId: o.supplier.id,
      lines: o.lines.length,
      estimate: est > 0 ? Math.round(est * 100) / 100 : null,
    };
  });
}

export type SupplierOrderListItem = Awaited<ReturnType<typeof listSupplierOrders>>[number];

export async function loadSupplierOrder(id: number) {
  const o = await prisma.supplierOrder.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      deliveryDate: true,
      signature: true,
      note: true,
      addedBy: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      lines: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true, productId: true, label: true, reference: true, quantity: true, unit: true, unitPrice: true },
      },
    },
  });
  if (!o) return null;
  const lines = o.lines.map((l) => ({
    id: l.id,
    productId: l.productId,
    label: l.label,
    reference: l.reference,
    quantity: Number(l.quantity),
    unit: l.unit,
    unitPrice: num(l.unitPrice),
  }));
  const est = lines.reduce((s, l) => s + (l.unitPrice != null ? l.unitPrice * l.quantity : 0), 0);
  const order = {
    id: o.id,
    date: isoDay(o.date),
    deliveryDate: o.deliveryDate ? isoDay(o.deliveryDate) : null,
    signature: o.signature,
    note: o.note,
    addedBy: o.addedBy,
    createdAt: o.createdAt.toISOString(),
    supplier: o.supplier.name,
    supplierId: o.supplier.id,
    lines,
    estimate: est > 0 ? Math.round(est * 100) / 100 : null,
    /** Lignes sans prix connu : l'estimation ne les compte pas. */
    unpriced: lines.filter((l) => l.unitPrice == null).length,
  };
  return { ...order, text: orderText({ supplier: order.supplier, signature: order.signature, deliveryDate: order.deliveryDate, note: order.note, lines }) };
}

export type SupplierOrderDetail = NonNullable<Awaited<ReturnType<typeof loadSupplierOrder>>>;

export async function deleteSupplierOrder(id: number): Promise<boolean> {
  const { count } = await prisma.supplierOrder.deleteMany({ where: { id } });
  return count > 0;
}
