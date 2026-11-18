/**
 * Commandes aux fournisseurs : lecture du catalogue (léger, sans historique
 * des prix), enregistrement, liste et suppression des commandes.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { parseDay } from "./purchaseOrders";
import { articleOf } from "./suppliers";
import { orderText, orderUnits, packNameOf } from "./supplierOrders";

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
};

/**
 * Produits d'un fournisseur pour passer une commande : une seule requête,
 * sans l'historique des prix (une mercuriale de plusieurs centaines de
 * produits reste légère à charger et à afficher).
 */
export async function loadOrderCatalog(supplierId: number) {
  const s = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!s) return null;
  const [products, recent, lastPlace] = await Promise.all([
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
    prisma.supplierOrder.findFirst({ where: { place: { not: null } }, orderBy: { id: "desc" }, select: { place: true } }),
  ]);
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
  const catalog: CatalogProduct[] = products.map((p) => {
    const base = { name: p.name, packName: p.packName, packSize: num(p.packSize), priceUnit: p.priceUnit };
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
    };
  });
  return {
    supplier: s,
    products: catalog,
    lastArticles: Object.fromEntries(lastByArticle),
    lastPlace: lastPlace?.place ?? null,
  };
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
  place?: string | null;
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
  const order = await prisma.supplierOrder.create({
    data: {
      supplierId: input.supplierId,
      date: parseDay(input.date || today),
      deliveryDate: input.deliveryDate ? parseDay(input.deliveryDate) : null,
      place: clean(input.place, 200),
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
      place: true,
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
      place: o.place,
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
      place: true,
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
    place: o.place,
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
  return { ...order, text: orderText({ supplier: order.supplier, place: order.place, deliveryDate: order.deliveryDate, note: order.note, lines }) };
}

export type SupplierOrderDetail = NonNullable<Awaited<ReturnType<typeof loadSupplierOrder>>>;

export async function deleteSupplierOrder(id: number): Promise<boolean> {
  const { count } = await prisma.supplierOrder.deleteMany({ where: { id } });
  return count > 0;
}
