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
import { articleKey, articleOf, packLabel, packagingWarning, priceStats, unitPriceOf, type ComparisonProduct } from "./suppliers";

import { purchaseLineAmounts } from "./purchaseLineSnapshot";

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
 * Variantes d'un même article chez un fournisseur (« Fraise France »,
 * « Fraise Espagne » rangées sous « Fraise ») : une nouvelle variante est
 * reliée au même ingrédient des recettes, et l'ingrédient qui suivait une
 * variante suit celle achetée le plus récemment. Le coût des recettes prend
 * donc le dernier prix payé pour l'article, quelle que soit la provenance.
 */
async function followArticles(tx: Tx, supplierId: number, productIds: number[]) {
  if (productIds.length === 0) return;
  const all = await tx.supplierProduct.findMany({
    where: { supplierId },
    select: { id: true, name: true, article: true, priceUnit: true, priceDate: true, baseId: true },
  });
  const keyOf = (p: (typeof all)[number]) => `${articleKey(articleOf(p))}|${p.priceUnit}`;
  const touchedKeys = new Set(all.filter((p) => productIds.includes(p.id)).map(keyOf));
  for (const key of touchedKeys) {
    const group = all.filter((p) => keyOf(p) === key);
    if (group.length < 2) continue;
    const newest = group
      .slice()
      .sort((a, b) => (b.priceDate?.getTime() ?? 0) - (a.priceDate?.getTime() ?? 0) || b.id - a.id)[0];
    const linkedBases = [...new Set(group.map((p) => p.baseId).filter((b): b is number => b != null))];
    // Une seule correspondance possible : les variantes sans ingrédient prennent celui de l'article.
    if (linkedBases.length === 1) {
      const unlinked = group.filter((p) => p.baseId == null && productIds.includes(p.id)).map((p) => p.id);
      if (unlinked.length) {
        await tx.supplierProduct.updateMany({ where: { id: { in: unlinked } }, data: { baseId: linkedBases[0] } });
      }
    }
    const followers = await tx.ingredientBase.findMany({
      where: { chosenProductId: { in: group.map((p) => p.id), not: newest.id } },
      select: { id: true },
    });
    if (followers.length === 0) continue;
    await tx.ingredientBase.updateMany({ where: { id: { in: followers.map((f) => f.id) } }, data: { chosenProductId: newest.id } });
    if (newest.baseId == null && linkedBases.length <= 1) {
      await tx.supplierProduct.update({ where: { id: newest.id }, data: { baseId: linkedBases[0] ?? followers[0].id } });
    }
    await syncChosenIngredients(tx, [newest.id]);
  }
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
    if (product.baseId !== baseId) {
      // Le produit change d'ingrédient : l'ancien ne le suit plus (il garde son dernier prix).
      if (product.baseId != null) {
        await tx.ingredientBase.updateMany({ where: { id: product.baseId, chosenProductId: productId }, data: { chosenProductId: null } });
      }
      await tx.supplierProduct.update({ where: { id: productId }, data: { baseId } });
    }
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
  /** Nouvelle variante rangée sous un article déjà acheté, avec l'évolution de l'article. */
  variantes_regroupees?: { article: string; variante: string; avant: string; apres: string; evolution: string }[];
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

      let replacedId: number | null = null;
      let keptNote: string | null = null;
      const touched: number[] = [];
      if (number) {
        const dup = await tx.purchaseOrder.findFirst({
          where: { supplierId: supplier.id, number: { equals: number, mode: "insensitive" } },
          select: { id: true, note: true, lines: { select: { productId: true } } },
        });
        if (dup) {
          if (!input.replace) {
            throw new Error(
              `la facture n° ${number} de ${supplier.name} est déjà enregistrée (id ${dup.id}) : remets remplacer=true pour la remplacer`,
            );
          }
          touched.push(...dup.lines.map((l) => l.productId));
          replacedId = dup.id;
          // Sans nouvelle remarque, celle de la facture remplacée est gardée (le fichier joint aussi : même facture).
          keptNote = dup.note;
        }
      }

      const data = { supplierId: supplier.id, date, number, total: input.total ?? null, note: input.note?.trim() || keptNote };
      const order = replacedId === null
        ? await tx.purchaseOrder.create({ data })
        : await tx.purchaseOrder.update({ where: { id: replacedId }, data: { ...data, lines: { deleteMany: {} } } });

      const created: string[] = [];
      const warnings: string[] = [];
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
            packSize: l.packSize != null && l.packSize > 0 ? l.packSize : 1,
            packPrice: l.packPrice ?? null,
            unitPrice,
            priceUnit: l.unit,
            lineTotal: l.lineTotal ?? null,
          },
        });
        lineCount++;
        touched.push(product.id);
        const warn = packagingWarning({ product: name, unit: l.unit, packSize: l.packSize });
        if (warn) warnings.push(warn);
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
      if (replacedId !== null) {
        // Produits de l'ancienne version qui ne sont plus sur aucune facture (nom corrigé…) : retirés.
        const orphans = (
          await tx.supplierProduct.findMany({ where: { id: { in: touched }, lines: { none: {} } }, select: { id: true } })
        ).map((p) => p.id);
        if (orphans.length) {
          await tx.ingredientBase.updateMany({ where: { chosenProductId: { in: orphans } }, data: { chosenProductId: null } });
          await tx.supplierProduct.deleteMany({ where: { id: { in: orphans } } });
          for (const o of orphans) before.delete(o);
          touched.splice(0, touched.length, ...touched.filter((t) => !orphans.includes(t)));
        }
      }
      await refreshProducts(tx, touched);
      for (const { baseId, productId } of linked) await autoChoose(tx, baseId, productId);
      // Nouvelles variantes d'un article déjà acheté (« Fraise Espagne » après « Fraise France ») : évolution de l'article.
      const variants: { article: string; variante: string; avant: string; apres: string; evolution: string }[] = [];
      if (created.length) {
        const all = await tx.supplierProduct.findMany({
          where: { supplierId: supplier.id },
          select: { id: true, name: true, article: true, price: true, priceUnit: true, priceDate: true },
        });
        const keyOf = (p: (typeof all)[number]) => `${articleKey(articleOf(p))}|${p.priceUnit}`;
        for (const p of all.filter((x) => created.includes(x.name))) {
          const prev = all
            .filter((x) => x.id !== p.id && !created.includes(x.name) && keyOf(x) === keyOf(p) && x.price != null)
            .sort((a, b) => (b.priceDate?.getTime() ?? 0) - (a.priceDate?.getTime() ?? 0))[0];
          const now = num(p.price);
          if (!prev || now == null) continue;
          const was = Number(prev.price);
          const pct = was > 0 ? Math.round(((now - was) / was) * 100) : null;
          variants.push({
            article: articleOf(p),
            variante: `${p.name} (avant : ${prev.name})`,
            avant: fmtPrice(was, prev.priceUnit),
            apres: fmtPrice(now, p.priceUnit),
            evolution: pct == null ? "—" : `${pct > 0 ? "+" : ""}${pct} %`,
          });
        }
      }
      await followArticles(tx, supplier.id, touched);

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
        ...(variants.length ? { variantes_regroupees: variants } : {}),
        ...(notFound.length ? { ingredients_introuvables: notFound } : {}),
        ...(ignored.length ? { lignes_ignorees: ignored } : {}),
        ...(warnings.length ? { a_verifier: warnings } : {}),
        ...(replacedId !== null ? { remplace: true } : {}),
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
// Gérer à la main (site et connecteur) : fournisseurs, produits, prix
// ─────────────────────────────────────────────

const cleanText = (v: string | null | undefined, max = 300) => (v == null ? null : v.trim().slice(0, max) || null);
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

async function supplierNameFree(tx: Tx, name: string, exceptId?: number) {
  const taken = await tx.supplier.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
  });
  if (taken) throw new Error(`Le fournisseur « ${taken.name} » existe déjà.`);
}

/** Nouveau fournisseur, tapé à la main. */
export async function createSupplier(input: { name: string; note?: string | null }): Promise<{ id: number; name: string }> {
  const name = cleanText(input.name, 120);
  if (!name) throw new Error("Le nom du fournisseur est vide.");
  return prisma.$transaction(async (tx) => {
    await supplierNameFree(tx, name);
    return tx.supplier.create({ data: { name, note: cleanText(input.note, 2000) }, select: { id: true, name: true } });
  });
}

/** Renomme un fournisseur et / ou change sa remarque (ses produits et factures restent). */
export async function updateSupplier(id: number, input: { name?: string; note?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const s = await tx.supplier.findUnique({ where: { id }, select: { id: true } });
    if (!s) throw new Error("Fournisseur introuvable.");
    const data: Prisma.SupplierUpdateInput = {};
    if (input.name !== undefined) {
      const name = cleanText(input.name, 120);
      if (!name) throw new Error("Le nom du fournisseur est vide.");
      await supplierNameFree(tx, name, id);
      data.name = name;
    }
    if (input.note !== undefined) data.note = cleanText(input.note, 2000);
    return tx.supplier.update({ where: { id }, data, select: { id: true, name: true, note: true } });
  });
}

/** Ce qui part avec un fournisseur : à montrer avant de confirmer la suppression. */
export async function supplierDeletionInfo(id: number) {
  const s = await prisma.supplier.findUnique({
    where: { id },
    select: {
      name: true,
      _count: { select: { products: true } },
      orders: { select: { manual: true, filePath: true } },
      products: { select: { chosenBy: { select: { name: true } } } },
    },
  });
  if (!s) return null;
  const invoices = s.orders.filter((o) => !o.manual);
  return {
    name: s.name,
    products: s._count.products,
    invoices: invoices.length,
    files: invoices.filter((o) => o.filePath).length,
    manualPrices: s.orders.length - invoices.length,
    /** Ingrédients des recettes qui prenaient leur prix chez ce fournisseur : ils gardent le dernier prix. */
    ingredients: [...new Set(s.products.flatMap((p) => p.chosenBy.map((b) => b.name)))].sort((a, b) => a.localeCompare(b, "fr")),
  };
}

/**
 * Supprime un fournisseur avec ses produits, ses factures et leurs prix. Les
 * ingrédients des recettes qui suivaient un de ses produits gardent leur
 * dernier prix (comme un prix tapé à la main). Renvoie les fichiers joints à effacer.
 */
export async function deleteSupplier(id: number): Promise<{ name: string; filePaths: string[] }> {
  return prisma.$transaction(async (tx) => {
    const s = await tx.supplier.findUnique({
      where: { id },
      select: { name: true, orders: { select: { filePath: true } }, products: { select: { id: true } } },
    });
    if (!s) throw new Error("Fournisseur introuvable.");
    await tx.ingredientBase.updateMany({
      where: { chosenProductId: { in: s.products.map((p) => p.id) } },
      data: { chosenProductId: null },
    });
    await tx.supplier.delete({ where: { id } });
    return { name: s.name, filePaths: s.orders.map((o) => o.filePath).filter((f): f is string => !!f) };
  });
}

export type ProductInput = {
  name?: string;
  reference?: string | null;
  article?: string | null;
  family?: string | null;
  /** Unité du prix : kg, L ou pièce. Ne change plus une fois qu'il y a des prix. */
  unit?: PriceUnit;
  /** Contenance d'un colis dans l'unité (25 pour un sac de 25 kg). */
  packSize?: number | null;
};

async function productNameFree(tx: Tx, supplierId: number, name: string, exceptId?: number) {
  const taken = await tx.supplierProduct.findFirst({
    where: { supplierId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { name: true },
  });
  if (taken) throw new Error(`Ce fournisseur a déjà un produit « ${taken.name} ».`);
}

/** Nouveau produit chez un fournisseur, avec son premier prix si on le connaît. */
export async function createProduct(
  supplierId: number,
  input: ProductInput & { name: string; price?: number | null; date?: string | null },
): Promise<{ id: number; name: string }> {
  const name = cleanText(input.name, 300);
  if (!name) throw new Error("Le nom du produit est vide.");
  const unit = input.unit && isPriceUnit(input.unit) ? input.unit : "kg";
  const product = await prisma.$transaction(async (tx) => {
    const s = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
    if (!s) throw new Error("Fournisseur introuvable.");
    await productNameFree(tx, supplierId, name);
    return tx.supplierProduct.create({
      data: {
        supplierId,
        name,
        reference: cleanText(input.reference, 100),
        article: cleanText(input.article, 200),
        family: cleanText(input.family, 80),
        priceUnit: unit,
        packSize: input.packSize != null && input.packSize > 0 ? input.packSize : null,
      },
      select: { id: true, name: true },
    });
  });
  if (input.price != null) await addManualPrice(product.id, { price: input.price, date: input.date ?? isoDay(new Date()) });
  return product;
}

/** Corrige le nom, la référence, l'article, la famille, la contenance (et l'unité tant qu'il n'y a pas de prix). */
export async function updateProduct(id: number, input: ProductInput) {
  await prisma.$transaction(async (tx) => {
    const p = await tx.supplierProduct.findUnique({
      where: { id },
      select: { id: true, supplierId: true, priceUnit: true, _count: { select: { lines: true } } },
    });
    if (!p) throw new Error("Produit introuvable.");
    const data: Prisma.SupplierProductUpdateInput = {};
    if (input.name !== undefined) {
      const name = cleanText(input.name, 300);
      if (!name) throw new Error("Le nom du produit est vide.");
      await productNameFree(tx, p.supplierId, name, id);
      data.name = name;
    }
    if (input.reference !== undefined) data.reference = cleanText(input.reference, 100);
    if (input.article !== undefined) data.article = cleanText(input.article, 200);
    if (input.family !== undefined) data.family = cleanText(input.family, 80);
    if (input.packSize !== undefined) data.packSize = input.packSize != null && input.packSize > 0 ? input.packSize : null;
    if (input.unit !== undefined && input.unit !== p.priceUnit) {
      if (!isPriceUnit(input.unit)) throw new Error("Unité inconnue (kg, L ou pièce).");
      if (p._count.lines > 0) throw new Error("L'unité ne change plus : ce produit a déjà des prix. Supprime ses prix d'abord.");
      data.priceUnit = input.unit;
    }
    await tx.supplierProduct.update({ where: { id }, data });
    // Un nouvel article peut regrouper ce produit avec d'autres variantes.
    if (input.article !== undefined) await followArticles(tx, p.supplierId, [id]);
  });
}

/**
 * Supprime un produit et tous ses prix. Il disparaît aussi des factures où il
 * était (leur total écrit ne change pas). L'ingrédient qui le suivait garde son dernier prix.
 */
export async function deleteProduct(id: number): Promise<{ name: string; invoices: number }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.supplierProduct.findUnique({
      where: { id },
      select: { name: true, lines: { select: { orderId: true, order: { select: { manual: true } } } } },
    });
    if (!p) throw new Error("Produit introuvable.");
    await tx.ingredientBase.updateMany({ where: { chosenProductId: id }, data: { chosenProductId: null } });
    await tx.supplierProduct.delete({ where: { id } });
    const manualOrders = [...new Set(p.lines.filter((l) => l.order.manual).map((l) => l.orderId))];
    if (manualOrders.length) await tx.purchaseOrder.deleteMany({ where: { id: { in: manualOrders }, lines: { none: {} } } });
    return { name: p.name, invoices: new Set(p.lines.filter((l) => !l.order.manual).map((l) => l.orderId)).size };
  });
}

/**
 * Ajoute un prix tapé à la main (sans facture) à une date : il entre dans
 * l'historique comme un prix de facture, et devient le prix actuel s'il est le plus récent.
 */
export async function addManualPrice(productId: number, input: { price: number; date: string; quantity?: number | null }) {
  const date = parseDay(input.date);
  if (!(input.price >= 0) || input.price > 10_000_000) throw new Error("Prix invalide.");
  return prisma.$transaction(async (tx) => {
    const p = await tx.supplierProduct.findUnique({
      where: { id: productId },
      select: { id: true, supplierId: true, priceUnit: true, packSize: true },
    });
    if (!p) throw new Error("Produit introuvable.");
    const packSize = num(p.packSize);
    const order = await tx.purchaseOrder.create({
      data: {
        supplierId: p.supplierId,
        date,
        manual: true,
        lines: {
          create: {
            productId,
            quantity: input.quantity ?? null,
            packSize: packSize ?? 1,
            packPrice: packSize != null ? round4(input.price * packSize) : null,
            unitPrice: input.price,
            priceUnit: p.priceUnit,
          },
        },
      },
      select: { id: true },
    });
    await refreshProducts(tx, [productId]);
    await followArticles(tx, p.supplierId, [productId]);
    return order;
  });
}

/**
 * Corrige un prix de l'historique (ligne de facture ou prix tapé à la main).
 * La date ne change que pour un prix tapé à la main : celle d'une facture se
 * corrige sur la facture. Le prix du colis et le montant sont recalculés.
 */
export async function updatePriceLine(lineId: number, input: { price?: number; quantity?: number | null; date?: string }) {
  return prisma.$transaction(async (tx) => {
    const l = await tx.purchaseOrderLine.findUnique({
      where: { id: lineId },
      select: { id: true, productId: true, packSize: true, orderId: true, order: { select: { manual: true, supplierId: true } } },
    });
    if (!l) throw new Error("Prix introuvable.");
    const data: Prisma.PurchaseOrderLineUpdateInput = {};
    if (input.price !== undefined) {
      if (!(input.price >= 0) || input.price > 10_000_000) throw new Error("Prix invalide.");
      const packSize = num(l.packSize);
      data.unitPrice = input.price;
      data.packPrice = packSize != null ? round4(input.price * packSize) : null;
      data.lineTotal = null;
    }
    if (input.quantity !== undefined) {
      data.quantity = input.quantity != null && input.quantity > 0 ? input.quantity : null;
      data.lineTotal = null;
    }
    await tx.purchaseOrderLine.update({ where: { id: lineId }, data });
    if (input.date !== undefined) {
      if (!l.order.manual) throw new Error("La date d'un prix de facture se change sur la facture.");
      await tx.purchaseOrder.update({ where: { id: l.orderId }, data: { date: parseDay(input.date) } });
    }
    await refreshProducts(tx, [l.productId]);
    await followArticles(tx, l.order.supplierId, [l.productId]);
  });
}

/** Retire un prix de l'historique. Le produit reste (avec ses autres prix). */
export async function deletePriceLine(lineId: number) {
  return prisma.$transaction(async (tx) => {
    const l = await tx.purchaseOrderLine.findUnique({
      where: { id: lineId },
      select: { productId: true, orderId: true, order: { select: { manual: true, supplierId: true } } },
    });
    if (!l) throw new Error("Prix introuvable.");
    await tx.purchaseOrderLine.delete({ where: { id: lineId } });
    if (l.order.manual) await tx.purchaseOrder.deleteMany({ where: { id: l.orderId, lines: { none: {} } } });
    await refreshProducts(tx, [l.productId]);
    await followArticles(tx, l.order.supplierId, [l.productId]);
  });
}

/** Corrige la date, le numéro, le total ou la remarque d'une facture. */
export async function updatePurchaseOrder(
  id: number,
  input: { date?: string; number?: string | null; total?: number | null; note?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, supplierId: true, lines: { select: { productId: true } } },
    });
    if (!o) throw new Error("Facture introuvable.");
    const data: Prisma.PurchaseOrderUpdateInput = {};
    if (input.date !== undefined) data.date = parseDay(input.date);
    if (input.number !== undefined) {
      const number = cleanText(input.number, 100);
      if (number) {
        const dup = await tx.purchaseOrder.findFirst({
          where: { supplierId: o.supplierId, number: { equals: number, mode: "insensitive" }, NOT: { id } },
          select: { id: true },
        });
        if (dup) throw new Error(`Une autre facture de ce fournisseur a déjà le n° ${number}.`);
      }
      data.number = number;
    }
    if (input.total !== undefined) {
      if (input.total != null && (!(input.total >= 0) || input.total > 10_000_000)) throw new Error("Total invalide.");
      data.total = input.total;
    }
    if (input.note !== undefined) data.note = cleanText(input.note, 2000);
    await tx.purchaseOrder.update({ where: { id }, data });
    if (input.date !== undefined) {
      const ids = [...new Set(o.lines.map((l) => l.productId))];
      await refreshProducts(tx, ids);
      await followArticles(tx, o.supplierId, ids);
    }
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
      id: true,
      unitPrice: true,
      priceUnit: true,
      quantity: true,
      order: { select: { id: true, date: true, number: true, manual: true } },
    },
    orderBy: [{ order: { date: "desc" } }, { id: "desc" }],
  },
} satisfies Prisma.SupplierProductSelect;

type ProductRow = Prisma.SupplierProductGetPayload<{ select: typeof productSelect }>;

export type PriceHistoryEntry = {
  date: string;
  price: number;
  unit: string;
  orderId: number;
  /** Ligne de facture (ou prix tapé à la main) : pour corriger ou supprimer ce prix. */
  lineId: number;
  /** true : prix tapé à la main sur le site, pas sur une facture. */
  manual: boolean;
  number: string | null;
  quantity: number | null;
};

function toComparisonProduct(p: ProductRow) {
  const history: PriceHistoryEntry[] = p.lines.map((l) => ({
    date: isoDay(l.order.date),
    price: Number(l.unitPrice),
    unit: l.priceUnit,
    orderId: l.order.id,
    lineId: l.id,
    manual: l.order.manual,
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
    packSize: num(p.packSize),
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
      select: { id: true, name: true, _count: { select: { products: true, orders: { where: { manual: false } } } } },
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
        where: { manual: false },
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
    manual: false,
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
      manual: true,
      createdAt: true,
      supplier: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          packPrice: true,
          packSize: true,
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
    manual: o.manual,
    file: o.filePath ? { type: o.filePath.toLowerCase().endsWith(".pdf") ? "pdf" : "image" } : null,
    supplier: o.supplier,
    lines: o.lines.map((l) => {
      // Prix d'un colis (ou d'une unité) et montant de la ligne, recalculés s'ils ne sont pas écrits.
      const { each, amount } = purchaseLineAmounts({
        quantity: num(l.quantity), packSize: num(l.packSize), packPrice: num(l.packPrice),
        unitPrice: Number(l.unitPrice), lineTotal: num(l.lineTotal),
      });
      return {
      id: l.id,
      each,
      amount,
      productId: l.product.id,
      product: l.product.name,
      packLabel: l.packSize == null ? "conditionnement historique inconnu" : packLabel(Number(l.packSize), l.priceUnit),
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

/**
 * Tous les produits des fournisseurs qui ont un prix, pour en chercher un
 * depuis le coût d'une recette et le relier à un ingrédient.
 */
export async function searchableProducts() {
  const products = await prisma.supplierProduct.findMany({
    where: { price: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      article: true,
      packSize: true,
      price: true,
      priceUnit: true,
      priceDate: true,
      supplier: { select: { id: true, name: true } },
      base: { select: { id: true, name: true } },
    },
  });
  return products.map((p) => ({
    productId: p.id,
    name: p.name,
    article: p.article,
    supplierId: p.supplier.id,
    supplier: p.supplier.name,
    packLabel: packLabel(num(p.packSize), p.priceUnit),
    price: Number(p.price),
    unit: (isPriceUnit(p.priceUnit) ? p.priceUnit : "kg") as PriceUnit,
    date: p.priceDate ? isoDay(p.priceDate) : null,
    base: p.base,
  }));
}

export type SearchableProduct = Awaited<ReturnType<typeof searchableProducts>>[number];
