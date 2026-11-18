"use server";

import { revalidatePath } from "next/cache";
import { requireAccess } from "@/lib/auth/guard";
import type { Viewer } from "@/lib/auth/viewer";
import { prisma } from "@/lib/prisma";
import { getQuotaIA } from "@/lib/auth/passerelle";
import { lireAvecIA, testerCle, fichierAccepte, type ResultatIA } from "@/lib/ia/appel";
import { nettoyerDocument, type DocumentLu, type LigneLue, type TypeLecture } from "@/lib/ia/document";
import {
  getReglagesIA,
  saveReglagesIA,
  versPublic,
  type FournisseurIA,
  type ModeIA,
  type ReglagesIAPublic,
} from "@/lib/ia/reglages";
import { lancer, suivre } from "@/lib/ia/travaux";
import { recordPurchaseOrder, type PurchaseOrderSummary } from "@/lib/purchaseOrders";
import { INVOICE_MAX_BYTES, attachInvoiceFile, sniffInvoiceExt } from "@/lib/invoiceFiles";
import { devinerColonnes, ligneEntete } from "@/lib/mercuriale";
import { articleKey } from "@/lib/suppliers";
import { lireTableur } from "@/lib/mercurialeFichier";
import { finishPendingInvoice, pendingDocument, setPendingError } from "@/lib/pendingInvoices";
import { modesAnalyse, savePrefere, type ModeAnalyse, type ModesAnalyse } from "@/lib/ia/analyse";

/**
 * Lecture des factures et des mercuriales par IA (lot 7 de la plateforme).
 * 1. lancerLecture : le fichier part à l'IA en arrière-plan ;
 * 2. suivreLecture : le navigateur demande où elle en est ;
 * 3. l'utilisateur vérifie et corrige les lignes ;
 * 4. enregistrerFactureLue / enregistrerMercuriale : rien n'est écrit avant.
 */

type Erreur = { ok: false; error: string };
const erreur = (e: unknown): Erreur => ({ ok: false, error: e instanceof Error ? e.message : "Erreur inattendue." });
const refresh = () => revalidatePath("/", "layout");

function qui(viewer: Viewer): string {
  return viewer.kind === "account" ? `compte:${viewer.account.id}` : viewer.kind;
}

/** Mime d'après le contenu (le navigateur peut se tromper) : PDF, JPG, PNG ou WebP. */
function mimeDe(bytes: Buffer): string | null {
  const ext = sniffInvoiceExt(bytes);
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".jpg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return null;
}

// ─────────────────────────────────────────────
// État (boutons des pages Factures et Fournisseur)
// ─────────────────────────────────────────────

export type EtatIA = {
  mode: ModeIA;
  /** Prête à lire : réglée, et pour la plateforme, clé présente et lectures restantes. */
  prete: boolean;
  message: string | null;
  quota: { limite: number; utilise: number } | null;
};

export async function etatLectureIA(): Promise<EtatIA> {
  await requireAccess("costs.edit");
  const r = await getReglagesIA();
  if (r.mode === "off") return { mode: "off", prete: false, message: "La lecture par IA est coupée : un administrateur peut l'activer dans Réglages → Lecture des factures.", quota: null };
  if (r.mode === "cle") return { mode: "cle", prete: !!r.cle, message: r.cle ? null : "Aucune clé d'API enregistrée.", quota: null };
  const q = await getQuotaIA();
  if (!q.ok) return { mode: "plateforme", prete: false, message: q.message, quota: null };
  if (q.quota.analyse === "mcp") {
    return { mode: "plateforme", prete: false, message: "Ton offre lit les documents avec Claude (connecteur RecipeLog) : garde-les pour Claude.", quota: null };
  }
  const { disponible, limite, utilise } = q.quota;
  if (!disponible) return { mode: "plateforme", prete: false, message: "La lecture par IA n'est pas encore ouverte sur ton offre. Demande-la à RecipeLog, ou mets ta propre clé d'IA dans les réglages.", quota: { limite, utilise } };
  if (utilise >= limite) return { mode: "plateforme", prete: false, message: `Les ${limite} lectures du mois sont utilisées. Elles reviennent le 1er du mois ; tu peux aussi mettre ta propre clé d'IA dans les réglages.`, quota: { limite, utilise } };
  return { mode: "plateforme", prete: true, message: null, quota: { limite, utilise } };
}

// ─────────────────────────────────────────────
// Lecture d'un fichier
// ─────────────────────────────────────────────

export type ResultatLecture = ResultatIA;

/**
 * fd : fichier (PDF ou photo), type (facture | mercuriale), fournisseurId (mercuriale) ;
 * ou attenteId : une facture « à traiter » déjà gardée sur le site (ses pages sont lues ensemble).
 */
export async function lancerLecture(fd: FormData): Promise<{ ok: true; id: string } | Erreur> {
  const viewer = await requireAccess("costs.edit");
  try {
    const attenteId = Number(fd.get("attenteId")) || null;
    let fichier: { data: Buffer; mime: string; nom: string };
    let attente: Awaited<ReturnType<typeof pendingDocument>> | null = null;
    if (attenteId) {
      fichier = attente = await pendingDocument(attenteId);
    } else {
      const f = fd.get("fichier");
      if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Choisis un fichier." };
      if (f.size > INVOICE_MAX_BYTES) return { ok: false, error: `Fichier trop lourd (${Math.round(INVOICE_MAX_BYTES / 1024 / 1024)} Mo au plus).` };
      const data = Buffer.from(await f.arrayBuffer());
      const mime = mimeDe(data);
      if (!mime || !fichierAccepte(mime)) return { ok: false, error: "Envoie un PDF ou une photo (JPG, PNG ou WebP)." };
      fichier = { data, mime, nom: f.name };
    }
    // Un document « à traiter » sait lui-même s'il est une facture ou une mercuriale (et de quel fournisseur).
    const type: TypeLecture = attente ? attente.kind : fd.get("type") === "mercuriale" ? "mercuriale" : "facture";
    const fournisseurId = (attente ? attente.supplierId : null) ?? (Number(fd.get("fournisseurId")) || null);

    const reglages = await getReglagesIA();
    if (reglages.mode === "off") return { ok: false, error: "La lecture par IA est coupée (Réglages → Lecture des factures)." };
    const [produits, fournisseur] = await Promise.all([
      prisma.supplierProduct.findMany({ where: { article: { not: null } }, select: { article: true }, distinct: ["article"], take: 400 }),
      fournisseurId ? prisma.supplier.findUnique({ where: { id: fournisseurId }, select: { name: true } }) : null,
    ]);
    const ctx = { articles: produits.map((p) => p.article!).filter(Boolean), fournisseur: fournisseur?.name ?? null };
    const id = lancer<ResultatLecture>(
      qui(viewer),
      async () => {
        const r = await lireAvecIA(reglages, fichier, type, ctx);
        // La facture reste « à traiter » : on note pourquoi la lecture a échoué, pour la liste.
        if (attenteId) await setPendingError(attenteId, r.ok ? null : r.message);
        return r;
      },
      () => ({ ok: false, code: "ia_erreur", message: "Erreur inattendue pendant la lecture." }),
    );
    return { ok: true, id };
  } catch (e) {
    return erreur(e);
  }
}

export async function suivreLecture(id: string): Promise<{ etat: "en_cours" } | { etat: "fini"; resultat: ResultatLecture } | { etat: "perdu" }> {
  const viewer = await requireAccess("costs.edit");
  const t = suivre<ResultatLecture>(qui(viewer), String(id));
  return t ?? { etat: "perdu" };
}

/** Produits déjà connus chez ce fournisseur (pour marquer les lignes nouvelles et les prix qui changent). */
export async function produitsConnus(fournisseur: string): Promise<{ nom: string; reference: string | null; article: string | null; prix: number | null; unite: string; contenance: number | null }[]> {
  await requireAccess("costs.edit");
  const nom = fournisseur.trim();
  if (!nom) return [];
  const s = await prisma.supplier.findFirst({ where: { name: { equals: nom, mode: "insensitive" } }, select: { id: true } });
  if (!s) return [];
  const p = await prisma.supplierProduct.findMany({
    where: { supplierId: s.id },
    select: { name: true, reference: true, article: true, price: true, priceUnit: true, packSize: true },
  });
  return p.map((x) => ({ nom: x.name, reference: x.reference, article: x.article?.trim() || null, prix: x.price == null ? null : Number(x.price), unite: x.priceUnit, contenance: x.packSize == null ? null : Number(x.packSize) }));
}

/** Articles déjà utilisés, tous fournisseurs confondus (liste proposée dans le champ Article). */
export async function articlesConnus(): Promise<string[]> {
  await requireAccess("costs.edit");
  const p = await prisma.supplierProduct.findMany({ where: { article: { not: null } }, select: { article: true }, distinct: ["article"], take: 2000 });
  return p.map((x) => x.article!.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, "fr"));
}

// ─────────────────────────────────────────────
// Enregistrement après vérification
// ─────────────────────────────────────────────

/** « RIBERA SAS » et « Ribera » : même nom une fois retirés la casse, les accents, la ponctuation et la forme de société. */
function cleFournisseur(nom: string): string {
  return articleKey(nom)
    .replace(/[.,;:'’()&/-]+/g, " ")
    .replace(/\b(sas|sasu|sarl|sa|eurl|sci|snc|ets|etablissements|societe|ste|et fils|france)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Un fournisseur déjà enregistré dont le nom ressemble à celui-ci (sans être exactement le même). */
async function fournisseurRessemblant(nom: string): Promise<string | null> {
  const tous = await prisma.supplier.findMany({ select: { name: true } });
  if (tous.some((s) => s.name.trim().toLowerCase() === nom.trim().toLowerCase())) return null;
  const cle = cleFournisseur(nom);
  if (!cle) return null;
  return tous.find((s) => cleFournisseur(s.name) === cle)?.name ?? null;
}

function versLignes(lignes: LigneLue[]) {
  return lignes.map((l) => ({
    product: l.produit,
    reference: l.reference,
    article: l.article,
    family: l.famille,
    quantity: l.quantite,
    packSize: l.contenance,
    unit: l.unite,
    unitPrice: l.prixUnitaire,
    packPrice: l.prixColis,
    lineTotal: l.montant,
  }));
}

/** Relit ce que le navigateur renvoie (même nettoyage que la réponse de l'IA). */
function relire(doc: unknown): DocumentLu {
  const d = (doc && typeof doc === "object" ? doc : {}) as Record<string, unknown>;
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  return nettoyerDocument({
    fournisseur: d.fournisseur,
    date: d.date,
    numero: d.numero,
    total_ht: d.total,
    remarque: d.remarque,
    lignes: lignes.map((x) => {
      const l = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
      return {
        produit: l.produit, reference: l.reference, article: l.article, famille: l.famille, quantite: l.quantite,
        contenance: l.contenance, unite_prix: l.unite, prix_unitaire: l.prixUnitaire, prix_colis: l.prixColis,
        montant_ligne: l.montant, a_verifier: null,
      };
    }),
  });
}

/** fd : document (JSON vérifié), remplacer (« 1 »), fichier (joint à la facture) ou attenteId (ses pages sont jointes, puis elle sort de « À traiter »). */
export async function enregistrerFactureLue(fd: FormData): Promise<{ ok: true; resume: PurchaseOrderSummary; fichierJoint: boolean } | Erreur> {
  await requireAccess("costs.edit");
  try {
    const doc = relire(JSON.parse(String(fd.get("document") ?? "{}")));
    if (!doc.fournisseur) return { ok: false, error: "Indique le fournisseur." };
    if (!doc.date) return { ok: false, error: "Indique la date de la facture." };
    if (!doc.lignes.length) return { ok: false, error: "Aucune ligne à enregistrer." };
    if (fd.get("nouveauFournisseur") !== "1") {
      const proche = await fournisseurRessemblant(doc.fournisseur);
      if (proche) {
        return { ok: false, error: `Ce fournisseur ressemble à « ${proche} », déjà enregistré. Choisis « ${proche} » dans le champ Fournisseur pour lui ajouter cette facture, ou coche la case pour créer un nouveau fournisseur.` };
      }
    }
    const note = String(fd.get("note") ?? "").trim().slice(0, 2000) || null;
    const resume = await recordPurchaseOrder({
      supplier: doc.fournisseur,
      date: doc.date,
      number: doc.numero,
      total: doc.total,
      note,
      replace: fd.get("remplacer") === "1",
      keepFamily: true,
      lines: versLignes(doc.lignes),
    });
    let fichierJoint = false;
    const f = fd.get("fichier");
    const attenteId = Number(fd.get("attenteId")) || null;
    if (attenteId) {
      fichierJoint = await finishPendingInvoice(attenteId, resume.facture_id);
    } else if (f instanceof File && f.size > 0) {
      try {
        await attachInvoiceFile(resume.facture_id, Buffer.from(await f.arrayBuffer()));
        fichierJoint = true;
      } catch {
        fichierJoint = false;
      }
    }
    refresh();
    return { ok: true, resume, fichierJoint };
  } catch (e) {
    return erreur(e);
  }
}

/** Mercuriale : les prix entrent dans l'historique du fournisseur, à la date choisie, sans compter comme une facture. */
/** attenteId : la mercuriale venait de « À traiter » ; son fichier est joint et elle quitte la liste. */
export async function enregistrerMercuriale(input: {
  fournisseurId: number;
  date: string;
  nomFichier: string;
  lignes: LigneLue[];
  attenteId?: number | null;
}): Promise<{ ok: true; resume: PurchaseOrderSummary; fichierJoint: boolean | null } | Erreur> {
  await requireAccess("costs.edit");
  try {
    const s = await prisma.supplier.findUnique({ where: { id: Number(input.fournisseurId) || 0 }, select: { name: true } });
    if (!s) return { ok: false, error: "Fournisseur introuvable." };
    const doc = relire({ fournisseur: s.name, date: input.date, lignes: input.lignes });
    if (!doc.date) return { ok: false, error: "Indique la date des prix." };
    if (!doc.lignes.length) return { ok: false, error: "Aucune ligne avec un prix." };
    const resume = await recordPurchaseOrder({
      supplier: s.name,
      date: doc.date,
      manual: true,
      note: `Mercuriale importée${input.nomFichier ? ` (${String(input.nomFichier).slice(0, 120)})` : ""}`,
      keepFamily: true,
      lines: versLignes(doc.lignes),
    });
    const fichierJoint = input.attenteId ? await finishPendingInvoice(Number(input.attenteId), resume.facture_id) : null;
    refresh();
    return { ok: true, resume, fichierJoint };
  } catch (e) {
    return erreur(e);
  }
}

/** Tableau Excel ou CSV : cases en texte, ligne des titres et colonnes devinées. */
export async function lireTableurMercuriale(fd: FormData): Promise<{ ok: true; lignes: string[][]; entete: number; colonnes: ReturnType<typeof devinerColonnes> } | Erreur> {
  await requireAccess("costs.edit");
  try {
    const f = fd.get("fichier");
    if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Choisis un fichier." };
    if (f.size > INVOICE_MAX_BYTES) return { ok: false, error: "Fichier trop lourd." };
    const lignes = await lireTableur(f.name, Buffer.from(await f.arrayBuffer()));
    if (!lignes.length) return { ok: false, error: "Le fichier est vide." };
    const entete = ligneEntete(lignes);
    return { ok: true, lignes, entete, colonnes: devinerColonnes(lignes[entete] ?? []) };
  } catch (e) {
    return erreur(e);
  }
}

// ─────────────────────────────────────────────
// Réglages
// ─────────────────────────────────────────────

export type InfosReglagesIA = { reglages: ReglagesIAPublic; quota: { disponible: boolean; limite: number; utilise: number } | null };

export async function lireReglagesIA(): Promise<InfosReglagesIA> {
  await requireAccess("site.update");
  const r = versPublic(await getReglagesIA());
  let quota: InfosReglagesIA["quota"] = null;
  if (r.plateforme) {
    const q = await getQuotaIA();
    if (q.ok) quota = { disponible: q.quota.disponible, limite: q.quota.limite, utilise: q.quota.utilise };
  }
  return { reglages: r, quota };
}

/** Réglages → Lecture des factures : ce que le panel permet, et le mode préféré. */
export async function lireModesAnalyse(): Promise<ModesAnalyse> {
  await requireAccess("costs.edit");
  return modesAnalyse();
}

export async function sauverModeAnalyse(prefere: ModeAnalyse): Promise<{ ok: true; modes: ModesAnalyse } | Erreur> {
  await requireAccess("site.update");
  try {
    const m = await modesAnalyse();
    if (prefere !== "ia" && prefere !== "mcp") return { ok: false, error: "Choisis l'IA ou Claude." };
    if (!m[prefere]) return { ok: false, error: prefere === "ia" ? "La lecture par IA n'est pas comprise dans ton offre." : "Claude (MCP) n'est pas compris dans ton offre." };
    await savePrefere(prefere);
    refresh();
    return { ok: true, modes: await modesAnalyse() };
  } catch (e) {
    return erreur(e);
  }
}

export async function sauverReglagesIA(input: { mode: ModeIA; fournisseur: FournisseurIA; cle?: string; modele?: string }): Promise<{ ok: true; reglages: ReglagesIAPublic } | Erreur> {
  await requireAccess("site.update");
  try {
    const mode: ModeIA = input.mode === "cle" || input.mode === "plateforme" ? input.mode : "off";
    const fournisseur: FournisseurIA = input.fournisseur === "openai" || input.fournisseur === "gemini" ? input.fournisseur : "anthropic";
    const r = await saveReglagesIA({ mode, fournisseur, cle: input.cle, modele: input.modele });
    return { ok: true, reglages: versPublic(r) };
  } catch (e) {
    return erreur(e);
  }
}

export async function testerReglagesIA(): Promise<{ ok: true; message: string } | Erreur> {
  await requireAccess("site.update");
  const r = await getReglagesIA();
  if (r.mode === "off") return { ok: false, error: "La lecture par IA est coupée." };
  if (r.mode === "plateforme") {
    const q = await getQuotaIA();
    if (!q.ok) return { ok: false, error: q.message };
    if (!q.quota.disponible) return { ok: false, error: "La plateforme n'a pas encore ouvert la lecture par IA pour ton offre." };
    return { ok: true, message: `La plateforme répond : ${Math.max(0, q.quota.limite - q.quota.utilise)} lectures restantes ce mois-ci.` };
  }
  const t = await testerCle(r);
  return t.ok ? { ok: true, message: "La clé marche." } : { ok: false, error: t.message };
}
