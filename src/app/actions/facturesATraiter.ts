"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import type { Viewer } from "@/lib/auth/viewer";
import {
  createPendingInvoice,
  deletePendingInvoice,
  limitesFactures,
  listPendingInvoices,
  PAGES_MAX_ABSOLU,
  type LimitesFactures,
  type PendingInvoiceItem,
} from "@/lib/pendingInvoices";
import { prisma } from "@/lib/prisma";
import { INVOICE_MAX_BYTES } from "@/lib/invoiceFiles";
import { etatLectureIA, type EtatIA } from "./ia";
import { modesAnalyse, type ModesAnalyse } from "@/lib/ia/analyse";

/**
 * Bouton « Nouvelle facture » (page Factures) : la personne prend la facture en
 * photo ou la choisit dans sa galerie, le site la garde, puis elle choisit de
 * la faire lire tout de suite par l'IA ou de la laisser « à traiter ».
 */

type Erreur = { ok: false; error: string };
const erreur = (e: unknown): Erreur => ({ ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." });

function auteur(viewer: Viewer): string | null {
  return viewer.kind === "account" ? (viewer.realAccount ?? viewer.account).email : null;
}

/**
 * pagesMercuriale : une mercuriale peut avoir plus de pages qu'une facture.
 * octetsMax : poids maximum d'un fichier (PDF ou photo), vérifié aussi dans
 * le navigateur pour dire tout de suite « trop lourd » au lieu d'un envoi raté.
 */
export type EtatNouvelleFacture = {
  ia: EtatIA;
  limites: LimitesFactures;
  enAttente: number;
  pagesMercuriale: number;
  modes: ModesAnalyse;
  octetsMax: number;
};

export async function etatNouvelleFacture(): Promise<EtatNouvelleFacture> {
  await requireAccess("costs.edit");
  const [ia, limites, enAttente, modes] = await Promise.all([etatLectureIA(), limitesFactures(), prisma.pendingInvoice.count(), modesAnalyse()]);
  return { ia, limites, enAttente, pagesMercuriale: PAGES_MAX_ABSOLU, modes, octetsMax: INVOICE_MAX_BYTES };
}

/** fd : pages (une ou plusieurs photos, ou un PDF), note ; type « mercuriale » + fournisseurId pour une liste de prix. */
export async function ajouterFactureATraiter(fd: FormData): Promise<{ ok: true; facture: PendingInvoiceItem } | Erreur> {
  const viewer = await requireAccess("costs.edit");
  try {
    const fichiers = fd.getAll("pages").filter((f): f is File => f instanceof File && f.size > 0);
    const pages = await Promise.all(fichiers.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const modes = await modesAnalyse();
    if (!modes.ia && !modes.mcp) return { ok: false, error: "La lecture des documents n'est pas comprise dans ton offre : saisis-les à la main." };
    const mercuriale = fd.get("type") === "mercuriale";
    const facture = await createPendingInvoice({
      pages,
      note: String(fd.get("note") ?? ""),
      addedBy: auteur(viewer),
      kind: mercuriale ? "mercuriale" : "facture",
      supplierId: mercuriale ? Number(fd.get("fournisseurId")) || null : null,
    });
    revalidatePath(mercuriale ? `/fournisseurs/${facture.supplierId}` : "/factures");
    return { ok: true, facture };
  } catch (e) {
    return erreur(e);
  }
}

export async function listerFacturesATraiter(): Promise<PendingInvoiceItem[]> {
  await requireAccess("costs.edit");
  return listPendingInvoices();
}

export async function supprimerFactureATraiter(id: number): Promise<{ ok: true } | Erreur> {
  await requireAccess("costs.edit");
  try {
    if (!(await deletePendingInvoice(Number(id) || 0))) return { ok: false, error: "Ce document n'existe plus." };
    revalidatePath("/factures");
    revalidatePath("/fournisseurs/[id]", "page");
    return { ok: true };
  } catch (e) {
    return erreur(e);
  }
}
