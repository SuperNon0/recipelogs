"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/lib/actionResult";
import {
  chooseProductForIngredient,
  deletePurchaseOrder,
  linkProductToIngredient,
  productChoicesFor,
  searchableProducts,
  type ProductChoice,
  type SearchableProduct,
} from "@/lib/purchaseOrders";
import { INVOICE_MAX_BYTES, invoiceExt, removeInvoiceFile, saveInvoiceFile } from "@/lib/invoiceFiles";

const refresh = () => revalidatePath("/", "layout");
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." });

/** Produits possibles pour les ingrédients d'une recette (fenêtre du coût matière). */
export async function getProductChoices(names: string[]): Promise<ProductChoice[]> {
  await requireAccess("costs.view");
  return productChoicesFor(names.slice(0, 300));
}

/** Tous les produits des fournisseurs avec un prix (recherche depuis le coût d'une recette). */
export async function getSearchableProducts(): Promise<SearchableProduct[]> {
  await requireAccess("costs.view");
  return searchableProducts();
}

/** L'ingrédient utilise le prix de ce produit (null : plus de produit choisi). */
export async function chooseIngredientProduct(baseId: number, productId: number | null): Promise<ActionResult> {
  await requireAccess("costs.edit");
  try {
    await chooseProductForIngredient(baseId, productId);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Relie un produit à un ingrédient des recettes (null pour le détacher). */
export async function linkProduct(productId: number, baseId: number | null): Promise<ActionResult> {
  await requireAccess("costs.edit");
  try {
    await linkProductToIngredient(productId, baseId);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Article (nom pour comparer) et famille d'un produit. */
export async function updateProductInfo(productId: number, data: { article?: string; family?: string }): Promise<ActionResult> {
  await requireAccess("costs.edit");
  const clean = (v: string | undefined) => (v === undefined ? undefined : v.trim().slice(0, 200) || null);
  await prisma.supplierProduct.update({
    where: { id: productId },
    data: { article: clean(data.article), family: clean(data.family) },
  });
  refresh();
  return { ok: true };
}

export async function renameSupplier(id: number, name: string): Promise<ActionResult> {
  await requireAccess("costs.edit");
  const n = name.trim();
  if (!n) return { ok: false, error: "Le nom est vide." };
  const taken = await prisma.supplier.findFirst({ where: { name: { equals: n, mode: "insensitive" }, NOT: { id } } });
  if (taken) return { ok: false, error: `« ${taken.name} » existe déjà.` };
  await prisma.supplier.update({ where: { id }, data: { name: n } });
  refresh();
  return { ok: true };
}

/** Supprime une facture (ses prix sortent de l'historique). */
export async function deleteInvoice(id: number): Promise<ActionResult> {
  await requireAccess("costs.edit");
  try {
    const { filePath } = await deletePurchaseOrder(id);
    await removeInvoiceFile(filePath);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return { ok: true };
}

/** Joint (ou remplace) la photo ou le PDF d'une facture. */
export async function uploadInvoiceFile(id: number, fd: FormData): Promise<ActionResult> {
  await requireAccess("costs.edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Aucun fichier." };
  if (file.size > INVOICE_MAX_BYTES) return { ok: false, error: "Fichier trop lourd." };
  const ext = invoiceExt(file.name, file.type);
  if (!ext) return { ok: false, error: "Photo (JPG, PNG, WebP) ou PDF seulement." };
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, select: { filePath: true } });
  if (!order) return { ok: false, error: "Facture introuvable." };
  const rel = await saveInvoiceFile(id, Buffer.from(await file.arrayBuffer()), ext);
  await prisma.purchaseOrder.update({ where: { id }, data: { filePath: rel } });
  await removeInvoiceFile(order.filePath);
  refresh();
  return { ok: true };
}

export async function removeInvoiceAttachment(id: number): Promise<ActionResult> {
  await requireAccess("costs.edit");
  const order = await prisma.purchaseOrder.findUnique({ where: { id }, select: { filePath: true } });
  if (!order) return { ok: false, error: "Facture introuvable." };
  await prisma.purchaseOrder.update({ where: { id }, data: { filePath: null } });
  await removeInvoiceFile(order.filePath);
  refresh();
  return { ok: true };
}
