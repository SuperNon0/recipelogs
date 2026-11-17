"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import type { Viewer } from "@/lib/auth/viewer";
import {
  createPendingInvoice,
  deletePendingInvoice,
  limitesFactures,
  listPendingInvoices,
  type LimitesFactures,
  type PendingInvoiceItem,
} from "@/lib/pendingInvoices";
import { prisma } from "@/lib/prisma";
import { etatLectureIA, type EtatIA } from "./ia";

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

export type EtatNouvelleFacture = { ia: EtatIA; limites: LimitesFactures; enAttente: number };

export async function etatNouvelleFacture(): Promise<EtatNouvelleFacture> {
  await requireAccess("costs.edit");
  const [ia, limites, enAttente] = await Promise.all([etatLectureIA(), limitesFactures(), prisma.pendingInvoice.count()]);
  return { ia, limites, enAttente };
}

/** fd : pages (une ou plusieurs photos, ou un PDF), note. */
export async function ajouterFactureATraiter(fd: FormData): Promise<{ ok: true; facture: PendingInvoiceItem } | Erreur> {
  const viewer = await requireAccess("costs.edit");
  try {
    const fichiers = fd.getAll("pages").filter((f): f is File => f instanceof File && f.size > 0);
    const pages = await Promise.all(fichiers.map(async (f) => Buffer.from(await f.arrayBuffer())));
    const facture = await createPendingInvoice({ pages, note: String(fd.get("note") ?? ""), addedBy: auteur(viewer) });
    revalidatePath("/factures");
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
    if (!(await deletePendingInvoice(Number(id) || 0))) return { ok: false, error: "Cette facture n'existe plus." };
    revalidatePath("/factures");
    return { ok: true };
  } catch (e) {
    return erreur(e);
  }
}
