"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import type { Viewer } from "@/lib/auth/viewer";
import { groupProducts, mergeProducts } from "@/lib/purchaseOrders";
import { createSupplierOrder, deleteSupplierOrder, type SupplierOrderLineInput } from "@/lib/supplierOrdersDb";

type Erreur = { ok: false; error: string };
const fail = (e: unknown): Erreur => ({ ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." });

function auteur(viewer: Viewer): string | null {
  return viewer.kind === "account" ? (viewer.realAccount ?? viewer.account).email : null;
}

/** Bouton « Enregistrer la commande » : la commande est gardée, avec son PDF. */
export async function enregistrerCommande(input: {
  supplierId: number;
  deliveryDate?: string | null;
  signature?: string | null;
  note?: string | null;
  lines: SupplierOrderLineInput[];
}): Promise<{ ok: true; id: number } | Erreur> {
  const viewer = await requireAccess("costs.edit");
  try {
    const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
    const order = await createSupplierOrder({
      supplierId: Number(input.supplierId) || 0,
      deliveryDate: day(input.deliveryDate),
      signature: typeof input.signature === "string" ? input.signature : null,
      note: typeof input.note === "string" ? input.note : null,
      addedBy: auteur(viewer),
      lines: (Array.isArray(input.lines) ? input.lines : []).map((l) => ({
        productId: typeof l.productId === "number" ? l.productId : null,
        label: typeof l.label === "string" ? l.label : null,
        quantity: Number(l.quantity),
        unit: String(l.unit ?? ""),
      })),
    });
    revalidatePath("/fournisseurs", "layout");
    return { ok: true, id: order.id };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerCommande(id: number): Promise<{ ok: true } | Erreur> {
  await requireAccess("costs.edit");
  try {
    if (!(await deleteSupplierOrder(Number(id) || 0))) return { ok: false, error: "Cette commande n'existe plus." };
    revalidatePath("/fournisseurs", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Range des produits sous un même article (« Croissant »), depuis la fiche fournisseur. */
export async function regrouperProduits(supplierId: number, productIds: number[], article: string | null): Promise<{ ok: true; count: number } | Erreur> {
  await requireAccess("costs.edit");
  try {
    const ids = (Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return { ok: false, error: "Choisis au moins un produit." };
    const count = await groupProducts(Number(supplierId) || 0, ids, typeof article === "string" ? article : null);
    revalidatePath("/", "layout");
    return { ok: true, count };
  } catch (e) {
    return fail(e);
  }
}

/** Fusionne des doublons dans le produit gardé (leurs prix passent dans son historique), depuis la fiche fournisseur. */
export async function fusionnerDoublons(
  supplierId: number,
  keepId: number,
  duplicateIds: number[],
): Promise<{ ok: true; name: string; merged: number; prices: number } | Erreur> {
  await requireAccess("costs.edit");
  try {
    const ids = (Array.isArray(duplicateIds) ? duplicateIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    const r = await mergeProducts(Number(supplierId) || 0, Number(keepId) || 0, ids);
    revalidatePath("/", "layout");
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}
