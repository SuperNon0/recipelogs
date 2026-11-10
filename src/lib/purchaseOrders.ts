/**
 * Fournisseurs, produits achetés et factures (bons de commande).
 *
 * Une facture garde toutes ses lignes pour toujours : l'historique des prix
 * d'un produit, ce sont ses lignes de facture. Le prix « actuel » d'un produit
 * est celui de sa facture la plus récente (par date de facture). Un ingrédient
 * des recettes peut choisir un produit : son prix d'achat suit alors ce produit.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { isPriceUnit, type PriceUnit } from "./cost";
import { packLabel, priceStats, unitPriceOf, type ComparisonProduct } from "./suppliers";

type Tx = Prisma.TransactionClient;
const num = (v: Prisma.Decimal | number | null | undefined) => (v == null ? null : Number(v));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Date « AAAA-MM-JJ » → Date à minuit UTC (colonne DATE). */
export function parseDay(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`date invalide (${s}), format attendu AAAA-MM-JJ`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`date invalide (${s})`);
  return d;
}

// ─────────────────────────────────────────────
// Prix actuel d'un produit et ingrédients qui le suivent
// ─────────────────────────────────────────────

/** Recalcule le prix actuel des produits d'après leur facture la plus récente. */
async function refreshProducts(tx: Tx, productIds: number[]) {
  const ids = [...new Set(productIds)];
  for (const id of ids) {
    const last = await tx.purchaseOrderLine.findFirst({
      where: { productId: id },
      orderBy: [{ order: { date: "desc" } }, { id: "desc" }],
      select: { unitPrice: true, priceUnit: true, order: { select: { date: true } } },
    });
    await tx.supplierProduct.update({
      where: { id },
      data: last
        ? { price: last.unitPrice, priceUnit: last.priceUnit, priceDate: last.order.date }
        : { price: null, priceDate: null },
    });
  }
  await syncChosenIngredients(tx, ids);
}

/** Les ingrédients qui ont choisi un de ces produits prennent son prix (avec historique). */
async function syncChosenIngredients(tx: Tx, productIds: number[]) {
  if (productIds.length === 0) return;
  const bases = await tx.ingredientBase.findMany({
    where: { chosenProductId: { in: productIds } },
    select: {
      id: true,
      chosenProduct: { select: { price: true, priceUnit: true } },
      prices: { orderBy: { createdAt: "desc" }, take: 1, select: { price: true, priceUnit: true } },
    },
  });
  for (const b of bases) await applyProductPrice(tx, b.id, b.chosenProduct, b.prices[0]);
}

async function applyProductPrice(
  tx: Tx,
  baseId: number,
  product: { price: Prisma.Decimal | null; priceUnit: string } | null,
  lastHistory?: { price: Prisma.Decimal; priceUnit: string },
) {
  const price = num(product?.price);
  const unit = product?.priceUnit ?? "kg";
  await tx.ingredientBase.update({
    where: { id: baseId },
    data: { price, priceUnit: price != null ? unit : null },
  });
  const changed = price != null && (!lastHistory || Number(lastHistory.price) !== price || lastHistory.priceUnit !== unit);
  if (changed) await tx.ingredientPrice.create({ data: { baseId, price: price!, priceUnit: unit } });
}

/**
 * L'ingrédient utilise le prix de ce produit (null : plus de produit choisi,
 * le dernier prix reste comme prix saisi à la main). Le produit est relié à
 * l'ingrédient au passage.
 */
export async function chooseProductForIngredient(baseId: number, productId: number | null) {
  await prisma.$transaction(async (tx) => {
    const base = await tx.ingredientBase.findUnique({
      where: { id: baseId },
      select: { id: true, prices: { orderBy: { createdAt: "desc" }, take: 1, select: { price: true, priceUnit: true } } },
    });
    if (!base) throw new Error("Ingrédient introuvable.");
    if (productId == null) {
      await tx.ingredientBase.update({ where: { id: baseId }, data: { chosenProductId: null } });
      return;
    }
    const product = await tx.supplierProduct.findUnique({
      where: { id: productId },
      select: { id: true, baseId: true, price: true, priceUnit: true },
    });
    if (!product) throw new Error("Produit introuvable.");
    if (product.baseId !== baseId) await tx.supplierProduct.update({ where: { id: productId }, data: { baseId } });
    await tx.ingredientBase.update({ where: { id: baseId }, data: { chosenProductId: productId } });
    await applyProductPrice(tx, baseId, product, base.prices[0]);
  });
}

/**
 * Relie un produit à un ingrédient des recettes (null pour le détacher). Si
 * l'ingrédient n'avait encore aucun produit choisi, celui-ci devient son prix.
 */
export async function linkProductToIngredient(productId: number, baseId: number | null) {
  await prisma.$transaction(async (tx) => {
    const product = await tx.supplierProduct.findUnique({ where: { id: productId }, select: { id: true, baseId: true } });
    if (!product) throw new Error("Produit introuvable.");
    if (product.baseId && product.baseId !== baseId) {
      await tx.ingredientBase.updateMany({
        where: { id: product.baseId, chosenProductId: productId },
        data: { chosenProductId: null },
      });
    }
    await tx.supplierProduct.update({ where: { id: productId }, data: { baseId } });
    if (baseId != null) await autoChoose(tx, baseId, productId);
  });
}

async function autoChoose(tx: Tx, baseId: number, productId: number) {
  const base = await tx.ingredientBase.findUnique({
    where: { id: baseId },
    select: { chosenProductId: true, prices: { orderBy: { createdAt: "desc" }, take: 1, select: { price: true, priceUnit: true } } },
  });
  if (!base || base.chosenProductId != null) return false;
  const product = await tx.supplierProduct.findUnique({ where: { id: productId }, select: { price: true, priceUnit: true } });
  await tx.ingredientBase.update({ where: { id: baseId }, data: { chosenProductId: productId } });
  await applyProductPrice(tx, baseId, product, base.prices[0]);
  return true;
}

// ─────────────────────────────────────────────
// Enregistrer une facture
// ─────────────────────────────────────────────

export type PurchaseLineInput = {
  product: string;
  reference?: string | null;
  article?: string | null;
  family?: string | null;
  quantity?: number | null;
  packSize?: number | null;
  unit: PriceUnit;
  unitPrice?: number | null;
  packPrice?: number | null;
  lineTotal?: number | null;
  /** Ingrédient des recettes (id ou nom exact) auquel relier le produit. */
  ingredient?: number | string | null;
};

export type PurchaseOrderInput = {
  supplier: string;
  date: string;
  number?: string | null;
  total?: number | null;
  note?: string | null;
  /** Une facture avec le même numéro chez ce fournisseur est remplacée. */
  replace?: boolean;
  lines: PurchaseLineInput[];
};

export type PurchaseOrderSummary = {
  facture_id: number;
  fournisseur: string;
  date: string;
  lignes: number;
  total: number | null;
  nouveaux_produits: string[];
  prix_changes: { produit: string; avant: string; apres: string; evolution: string }[];
  ingredients_mis_a_jour: { ingredient: string; produit: string; prix: string }[];
  ingredients_introuvables?: string[];
  lignes_ignorees?: string[];
  remplace?: boolean;
};

const fmtPrice = (p: number, u: string) => `${p.toLocaleString("fr-FR", { maximumFractionDigits: 4 })} €/${u}`;

export async function recordPurchaseOrder(input: PurchaseOrderInput): Promise<PurchaseOrderSummary> {
  const date = parseDay(input.date);
  const supplierName = input.supplier.trim();
  if (!supplierName) throw new Error("nom du fournisseur manquant");
  const number = input.number?.trim() || null;

  return prisma.$transaction(
    async (tx) => {
      const supplier =
        (await tx.supplier.findFirst({ where: { name: { equals: supplierName, mode: "insensitive" } } })) ??
        (await tx.supplier.create({ data: { name: supplierName } }));

      let replaced = false;
      const touched: number[] = [];
      if (number) {
        const dup = await tx.purchaseOrder.findFirst({
          where: { supplierId: supplier.id, number: { equals: number, mode: "insensitive" } },
          select: { id: true, lines: { select: { productId: true } } },
        });
        if (dup) {
          if (!input.replace) {
            throw new Error(
              `la facture n° ${number} de ${supplier.name} est déjà enregistrée (id ${dup.id}) : remets remplacer=true pour la remplacer`,
            );
          }
          touched.push(...dup.lines.map((l) => l.productId));
          await tx.purchaseOrder.delete({ where: { id: dup.id } });
          replaced = true;
        }
      }

      const order = await tx.purchaseOrder.create({
        data: { supplierId: supplier.id, date, number, total: input.total ?? null, note: input.note?.trim() || null },
      });

      const created: string[] = [];
      const ignored: string[] = [];
      const notFound: string[] = [];
      const before = new Map<number, { name: string; price: number | null; unit: string }>();
      const linked: { baseId: number; productId: number }[] = [];
      let computedTotal = 0;
      let lineCount = 0;

      for (const l of input.lines) {
        const name = l.product.trim();
        const unitPrice = unitPriceOf(l);
        if (!name || unitPrice == null) {
          ignored.push(`${name || "(sans nom)"} : prix manquant`);
          continue;
        }
        const reference = l.reference?.trim() || null;
        let product =
          (reference
            ? await tx.supplierProduct.findFirst({ where: { supplierId: supplier.id, reference } })
            : null) ??
          (await tx.supplierProduct.findFirst({
            where: { supplierId: supplier.id, name: { equals: name, mode: "insensitive" } },
          }));
        const details = {
          ...(reference ? { reference } : {}),
          ...(l.article?.trim() ? { article: l.article.trim() } : {}),
          ...(l.family?.trim() ? { family: l.family.trim() } : {}),
          ...(l.packSize != null && l.packSize > 0 ? { packSize: l.packSize } : {}),
        };
        if (!product) {
          product = await tx.supplierProduct.create({
            data: { supplierId: supplier.id, name, priceUnit: l.unit, ...details },
          });
          created.push(name);
        } else {
          if (!before.has(product.id)) {
            before.set(product.id, { name: product.name, price: num(product.price), unit: product.priceUnit });
          }
          if (Object.keys(details).length) product = await tx.supplierProduct.update({ where: { id: product.id }, data: details });
        }

        await tx.purchaseOrderLine.create({
          data: {
            orderId: order.id,
            productId: product.id,
            quantity: l.quantity ?? null,
            packPrice: l.packPrice ?? null,
            unitPrice,
            priceUnit: l.unit,
            lineTotal: l.lineTotal ?? null,
          },
        });
        lineCount++;
        touched.push(product.id);
        const lt = l.lineTotal ?? (l.quantity != null ? (l.packPrice ?? unitPrice * (l.packSize ?? 1)) * l.quantity : null);
        if (lt != null) computedTotal += lt;

        if (l.ingredient != null && l.ingredient !== "") {
          const base =
            typeof l.ingredient === "number"
              ? await tx.ingredientBase.findUnique({ where: { id: l.ingredient }, select: { id: true } })
              : await tx.ingredientBase.findFirst({
                  where: { name: { equals: String(l.ingredient).trim(), mode: "insensitive" } },
                  select: { id: true },
                });
          if (!base) notFound.push(String(l.ingredient));
          else {
            await tx.supplierProduct.update({ where: { id: product.id }, data: { baseId: base.id } });
            linked.push({ baseId: base.id, productId: product.id });
          }
        }
      }

      if (lineCount === 0) throw new Error("aucune ligne avec un prix : rien n'a été enregistré");
      if (input.total == null && computedTotal > 0) {
        await tx.purchaseOrder.update({ where: { id: order.id }, data: { total: Math.round(computedTotal * 100) / 100 } });
      }

      const chosenBefore = new Map(
        (
          await tx.ingredientBase.findMany({
            where: { chosenProductId: { in: [...new Set(touched)] } },
            select: { id: true, price: true },
          })
        ).map((b) => [b.id, num(b.price)]),
      );
      await refreshProducts(tx, touched);
      for (const { baseId, productId } of linked) await autoChoose(tx, baseId, productId);

      const after = await tx.supplierProduct.findMany({
        where: { id: { in: [...before.keys()] } },
        select: { id: true, price: true, priceUnit: true },
      });
      const changes = after
        .map((p) => ({ p, b: before.get(p.id)! }))
        .filter(({ p, b }) => b.price != null && num(p.price) != null && (num(p.price) !== b.price || p.priceUnit !== b.unit))
        .map(({ p, b }) => {
          const now = num(p.price)!;
          const pct = b.unit === p.priceUnit && b.price! > 0 ? Math.round(((now - b.price!) / b.price!) * 100) : null;
          return {
            produit: b.name,
            avant: fmtPrice(b.price!, b.unit),
            apres: fmtPrice(now, p.priceUnit),
            evolution: pct == null ? "unité changée" : `${pct > 0 ? "+" : ""}${pct} %`,
          };
        });

      const followers = await tx.ingredientBase.findMany({
        where: { chosenProductId: { in: [...new Set(touched)] } },
        select: { id: true, name: true, price: true, priceUnit: true, chosenProduct: { select: { name: true } } },
      });
      const updated = followers
        .filter((b) => !chosenBefore.has(b.id) || chosenBefore.get(b.id) !== num(b.price))
        .map((b) => ({ ingredient: b.name, produit: b.chosenProduct?.name ?? "", prix: b.price != null ? fmtPrice(Number(b.price), b.priceUnit ?? "kg") : "—" }));

      const saved = await tx.purchaseOrder.findUnique({ where: { id: order.id }, select: { total: true } });
      return {
        facture_id: order.id,
        fournisseur: supplier.name,
        date: isoDay(date),
        lignes: lineCount,
        total: num(saved?.total),
        nouveaux_produits: created,
        prix_changes: changes,
        ingredients_mis_a_jour: updated,
        ...(notFound.length ? { ingredients_introuvables: notFound } : {}),
        ...(ignored.length ? { lignes_ignorees: ignored } : {}),
        ...(replaced ? { remplace: true } : {}),
      };
    },
    { timeout: 30_000 },
  );
}

/**
 * Supprime une facture et ses lignes. Les produits qui n'apparaissent plus
 * sur aucune facture sont retirés ; les autres reprennent le prix de leur
 * facture la plus récente. Renvoie le fichier joint à effacer, s'il y en a un.
 */
export async function deletePurchaseOrder(id: number): Promise<{ filePath: string | null }> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findUnique({
      where: { id },
      select: { filePath: true, lines: { select: { productId: true } } },
    });
    if (!order) throw new Error("Facture introuvable.");
    const ids = [...new Set(order.lines.map((l) => l.productId))];
    await tx.purchaseOrder.delete({ where: { id } });
    const orphans = (
      await tx.supplierProduct.findMany({ where: { id: { in: ids }, lines: { none: {} } }, select: { id: true } })
    ).map((p) => p.id);
    if (orphans.length) {
      // Un ingrédient qui suivait un produit retiré garde son dernier prix, saisi à la main.
      await tx.ingredientBase.updateMany({ where: { chosenProductId: { in: orphans } }, data: { chosenProductId: null } });
      await tx.supplierProduct.deleteMany({ where: { id: { in: orphans } } });
    }
    await refreshProducts(tx, ids.filter((i) => !orphans.includes(i)));
    return { filePath: order.filePath };
  });
}

// ─────────────────────────────────────────────
// Lecture
// ─────────────────────────────────────────────

const productSelect = {
  id: true,
  supplierId: true,
  name: true,
  reference: true,
  article: true,
  family: true,
  packSize: true,
  price: true,
  priceUnit: true,
  priceDate: true,
  baseId: true,
  base: { select: { id: true, name: true, chosenProductId: true } },
  lines: {
    select: {
      unitPrice: true,
      priceUnit: true,
      quantity: true,
      order: { select: { id: true, date: true, number: true } },
    },
    orderBy: [{ order: { date: "desc" } }, { id: "desc" }],
  },
} satisfies Prisma.SupplierProductSelect;

type ProductRow = Prisma.SupplierProductGetPayload<{ select: typeof productSelect }>;

export type PriceHistoryEntry = { date: string; price: number; unit: string; orderId: number; number: string | null; quantity: number | null };

function toComparisonProduct(p: ProductRow) {
  const history: PriceHistoryEntry[] = p.lines.map((l) => ({
    date: isoDay(l.order.date),
    price: Number(l.unitPrice),
    unit: l.priceUnit,
    orderId: l.order.id,
    number: l.order.number,
    quantity: num(l.quantity),
  }));
  const stats = priceStats(history.slice().reverse());
  const product: ComparisonProduct = {
    id: p.id,
    supplierId: p.supplierId,
    name: p.name,
    article: p.article,
    family: p.family,
    packLabel: packLabel(num(p.packSize), p.priceUnit),
    unit: p.priceUnit,
    stats,
  };
  return {
    ...product,
    reference: p.reference,
    base: p.base ? { id: p.base.id, name: p.base.name, chosen: p.base.chosenProductId === p.id } : null,
    history,
  };
}

export type ProductDetail = ReturnType<typeof toComparisonProduct>;

/** Tous les produits de tous les fournisseurs, avec leur historique (tableau comparatif). */
export async function loadAllProducts() {
  const [suppliers, products] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { products: true, orders: true } } },
    }),
    prisma.supplierProduct.findMany({ select: productSelect, orderBy: { name: "asc" } }),
  ]);
  return {
    suppliers: suppliers.map((s) => ({ id: s.id, name: s.name, products: s._count.products, orders: s._count.orders })),
    products: products.map(toComparisonProduct),
  };
}

export async function loadSupplier(id: number) {
  const s = await prisma.supplier.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      note: true,
      products: { select: productSelect, orderBy: { name: "asc" } },
      orders: {
        orderBy: [{ date: "desc" }, { id: "desc" }],
        select: { id: true, date: true, number: true, total: true, filePath: true, _count: { select: { lines: true } } },
      },
    },
  });
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    note: s.note,
    products: s.products.map(toComparisonProduct),
    orders: s.orders.map((o) => ({
      id: o.id,
      date: isoDay(o.date),
      number: o.number,
      total: num(o.total),
      hasFile: !!o.filePath,
      lines: o._count.lines,
      supplier: s.name,
      supplierId: s.id,
    })),
  };
}

/** Factures, de la plus récente à la plus ancienne, filtrables par période et fournisseur. */
export async function listPurchaseOrders(filter: { from?: string | null; to?: string | null; supplierId?: number | null } = {}) {
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(filter.supplierId ? { supplierId: filter.supplierId } : {}),
    ...(filter.from || filter.to
      ? {
          date: {
            ...(filter.from ? { gte: parseDay(filter.from) } : {}),
            ...(filter.to ? { lte: parseDay(filter.to) } : {}),
          },
        }
      : {}),
  };
  const orders = await prisma.purchaseOrder.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    select: {
      id: true,
      date: true,
      number: true,
      total: true,
      filePath: true,
      supplier: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    date: isoDay(o.date),
    number: o.number,
    total: num(o.total),
    hasFile: !!o.filePath,
    lines: o._count.lines,
    supplier: o.supplier.name,
    supplierId: o.supplier.id,
  }));
}

export type PurchaseOrderListItem = Awaited<ReturnType<typeof listPurchaseOrders>>[number];

export async function loadPurchaseOrder(id: number) {
  const o = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true,
      date: true,
      number: true,
      total: true,
      note: true,
      filePath: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          packPrice: true,
          unitPrice: true,
          priceUnit: true,
          lineTotal: true,
          product: { select: { id: true, name: true, packSize: true, priceUnit: true, base: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    date: isoDay(o.date),
    number: o.number,
    total: num(o.total),
    note: o.note,
    file: o.filePath ? { type: o.filePath.toLowerCase().endsWith(".pdf") ? "pdf" : "image" } : null,
    supplier: o.supplier,
    lines: o.lines.map((l) => {
      // Prix d'un colis (ou d'une unité) et montant de la ligne, recalculés s'ils ne sont pas écrits.
      const each = num(l.packPrice) ?? Number(l.unitPrice) * (num(l.product.packSize) ?? 1);
      const amount = num(l.lineTotal) ?? (l.quantity != null ? Math.round(each * Number(l.quantity) * 100) / 100 : null);
      return {
      id: l.id,
      each,
      amount,
      productId: l.product.id,
      product: l.product.name,
      packLabel: packLabel(num(l.product.packSize), l.product.priceUnit),
      ingredient: l.product.base,
      quantity: num(l.quantity),
      packPrice: num(l.packPrice),
      unitPrice: Number(l.unitPrice),
      unit: l.priceUnit,
      lineTotal: num(l.lineTotal),
      };
    }),
  };
}

/**
 * Produits possibles pour les ingrédients nommés (fenêtre « Quel chocolat ? »
 * du coût d'une recette) : ceux reliés à l'ingrédient, avec leur prix actuel.
 */
export async function productChoicesFor(names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const bases = await prisma.ingredientBase.findMany({
    where: { name: { in: wanted, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      price: true,
      priceUnit: true,
      chosenProductId: true,
      products: {
        where: { price: { not: null } },
        orderBy: { price: "asc" },
        select: {
          id: true,
          name: true,
          packSize: true,
          price: true,
          priceUnit: true,
          priceDate: true,
          supplier: { select: { name: true } },
        },
      },
    },
  });
  return bases.map((b) => ({
    baseId: b.id,
    name: b.name,
    chosenProductId: b.chosenProductId,
    manualPrice: b.chosenProductId == null && b.price != null ? { price: Number(b.price), unit: b.priceUnit ?? "kg" } : null,
    options: b.products.map((p) => ({
      productId: p.id,
      name: p.name,
      supplier: p.supplier.name,
      packLabel: packLabel(num(p.packSize), p.priceUnit),
      price: Number(p.price),
      unit: isPriceUnit(p.priceUnit) ? p.priceUnit : "kg",
      date: p.priceDate ? isoDay(p.priceDate) : null,
    })),
  }));
}

export type ProductChoice = Awaited<ReturnType<typeof productChoicesFor>>[number];
