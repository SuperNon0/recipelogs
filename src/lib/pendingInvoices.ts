import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { PDFDocument } from "pdf-lib";
import { prisma } from "./prisma";
import { uploadFilePath } from "./uploads";
import { INVOICE_MAX_BYTES, INVOICE_MIME, removeInvoiceFile, saveInvoiceFile, sniffInvoiceExt } from "./invoiceFiles";
import { getQuotaIA } from "./auth/passerelle";
import { surPlateforme } from "./ia/reglages";

/**
 * Factures « à traiter » : prises en photo (ou choisies dans la galerie) avec
 * le bouton « Nouvelle facture », gardées sur le site en attendant d'être lues
 * par l'IA ou remplies par Claude (outils MCP). Une fois la facture
 * enregistrée, ses pages deviennent le fichier joint (un PDF si plusieurs
 * pages) et elle sort de la liste.
 */

/** Plafond absolu de pages par facture, quel que soit le réglage du panel. */
export const PAGES_MAX_ABSOLU = 20;

export type LimitesFactures = {
  /** Nombre de factures à traiter gardées en même temps (0 = fonction coupée). */
  attente: number;
  /** Pages (photos) par facture. */
  pages: number;
};

function envInt(nom: string, defaut: number): number {
  const v = Number(process.env[nom]);
  return Number.isInteger(v) && v >= 0 ? v : defaut;
}

export function limitesParDefaut(): LimitesFactures {
  return {
    attente: envInt("RECIPELOG_FACTURES_ATTENTE_MAX", 30),
    pages: Math.min(PAGES_MAX_ABSOLU, Math.max(1, envInt("RECIPELOG_FACTURES_PAGES_MAX", 10))),
  };
}

/** Sur la plateforme, les limites viennent du panel (par la passerelle) ; sinon, du fichier .env. */
export async function limitesFactures(): Promise<LimitesFactures> {
  const defaut = limitesParDefaut();
  if (!surPlateforme()) return defaut;
  const q = await getQuotaIA();
  if (!q.ok || !q.quota.factures) return defaut;
  return { attente: q.quota.factures.attente, pages: Math.min(PAGES_MAX_ABSOLU, Math.max(1, q.quota.factures.pages)) };
}

export type PendingInvoiceItem = {
  id: number;
  pages: number;
  pdf: boolean;
  note: string | null;
  addedBy: string | null;
  lastError: string | null;
  createdAt: string;
};

const versItem = (p: { id: number; files: string[]; note: string | null; addedBy: string | null; lastError: string | null; createdAt: Date }): PendingInvoiceItem => ({
  id: p.id,
  pages: p.files.length,
  pdf: p.files.length === 1 && extname(p.files[0]).toLowerCase() === ".pdf",
  note: p.note,
  addedBy: p.addedBy,
  lastError: p.lastError,
  createdAt: p.createdAt.toISOString(),
});

export async function listPendingInvoices(): Promise<PendingInvoiceItem[]> {
  const rows = await prisma.pendingInvoice.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map(versItem);
}

export async function getPendingInvoice(id: number): Promise<PendingInvoiceItem | null> {
  const p = await prisma.pendingInvoice.findUnique({ where: { id } });
  return p ? versItem(p) : null;
}

/** Vérifie les pages envoyées et rend leur extension (erreur en français sinon). */
export function verifierPages(pages: Buffer[], limites: LimitesFactures): string[] {
  if (pages.length === 0) throw new Error("Ajoute au moins une photo de la facture.");
  if (pages.length > limites.pages) throw new Error(`${limites.pages} page${limites.pages > 1 ? "s" : ""} au plus par facture.`);
  const exts = pages.map((b, i) => {
    if (b.length === 0) throw new Error(`La page ${i + 1} est vide.`);
    if (b.length > INVOICE_MAX_BYTES) throw new Error(`La page ${i + 1} est trop lourde (${Math.round(INVOICE_MAX_BYTES / 1024 / 1024)} Mo au plus).`);
    const ext = sniffInvoiceExt(b);
    if (!ext) throw new Error(`La page ${i + 1} n'est ni une photo (JPG, PNG, WebP) ni un PDF.`);
    return ext;
  });
  if (exts.length > 1 && exts.includes(".pdf")) throw new Error("Un PDF s'envoie seul : il contient déjà toutes ses pages.");
  if (exts.length > 1 && exts.includes(".webp")) throw new Error("Les photos WebP s'envoient une par une. Reprends la photo ou choisis un JPG.");
  return exts;
}

/** Garde les pages sur le site. Refuse si la liste « À traiter » est pleine. */
export async function createPendingInvoice(input: { pages: Buffer[]; note?: string | null; addedBy?: string | null }): Promise<PendingInvoiceItem> {
  const limites = await limitesFactures();
  if (limites.attente === 0) throw new Error("Les factures à traiter ne sont pas ouvertes sur ton offre. Demande-les à RecipeLog.");
  const exts = verifierPages(input.pages, limites);
  const deja = await prisma.pendingInvoice.count();
  if (deja >= limites.attente) {
    throw new Error(`Tu as déjà ${deja} facture${deja > 1 ? "s" : ""} à traiter (${limites.attente} au plus). Analyse ou supprime celles qui attendent, puis réessaie.`);
  }
  const p = await prisma.pendingInvoice.create({
    data: { files: [], note: input.note?.trim().slice(0, 500) || null, addedBy: input.addedBy?.slice(0, 200) || null },
  });
  const files: string[] = [];
  try {
    const cle = randomBytes(4).toString("hex");
    for (let i = 0; i < input.pages.length; i++) {
      const rel = `factures/a-traiter/${p.id}-${cle}-${i + 1}${exts[i]}`;
      const abs = uploadFilePath(rel.split("/"));
      if (!abs) throw new Error("Chemin de fichier invalide.");
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, input.pages[i]);
      files.push(rel);
    }
    return versItem(await prisma.pendingInvoice.update({ where: { id: p.id }, data: { files } }));
  } catch (e) {
    for (const f of files) await removeInvoiceFile(f);
    await prisma.pendingInvoice.delete({ where: { id: p.id } }).catch(() => {});
    throw e;
  }
}

export async function readPendingPage(id: number, page: number): Promise<{ bytes: Buffer; type: string } | null> {
  const p = await prisma.pendingInvoice.findUnique({ where: { id }, select: { files: true } });
  const rel = p?.files[page - 1];
  if (!rel) return null;
  const abs = uploadFilePath(rel.split("/"));
  const type = INVOICE_MIME[extname(rel).toLowerCase()];
  if (!abs || !type) return null;
  try {
    return { bytes: await readFile(abs), type };
  } catch {
    return null;
  }
}

async function lirePages(id: number): Promise<{ bytes: Buffer; type: string }[]> {
  const p = await prisma.pendingInvoice.findUnique({ where: { id }, select: { files: true } });
  if (!p) throw new Error("Cette facture à traiter n'existe plus.");
  const pages: { bytes: Buffer; type: string }[] = [];
  for (let i = 1; i <= p.files.length; i++) {
    const f = await readPendingPage(id, i);
    if (!f) throw new Error(`La page ${i} de cette facture est introuvable sur le site.`);
    pages.push(f);
  }
  if (!pages.length) throw new Error("Cette facture n'a aucune page.");
  return pages;
}

// Côté le plus long d'une page du PDF, en points (842 = hauteur d'un A4).
const COTE_PAGE = 842;

/** Assemble des photos JPG / PNG en un PDF (une photo par page, à sa taille). */
export async function photosEnPdf(pages: { bytes: Buffer; type: string }[]): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Facture");
  pdf.setProducer("RecipeLog");
  for (const p of pages) {
    // Copie : un petit Buffer de Node partage sa mémoire avec d'autres (pdf-lib lirait au mauvais endroit).
    const octets = new Uint8Array(p.bytes);
    const img = p.type === "image/png" ? await pdf.embedPng(octets) : await pdf.embedJpg(octets);
    const echelle = COTE_PAGE / Math.max(img.width, img.height);
    const w = img.width * echelle;
    const h = img.height * echelle;
    pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  return Buffer.from(await pdf.save());
}

/** Le document à lire ou à joindre : la page seule, ou un PDF qui réunit toutes les photos. */
export async function pendingDocument(id: number): Promise<{ data: Buffer; mime: string; nom: string }> {
  const pages = await lirePages(id);
  if (pages.length === 1) {
    const ext = Object.entries(INVOICE_MIME).find(([, m]) => m === pages[0].type)?.[0] ?? ".jpg";
    return { data: pages[0].bytes, mime: pages[0].type, nom: `facture-${id}${ext}` };
  }
  return { data: await photosEnPdf(pages), mime: "application/pdf", nom: `facture-${id}.pdf` };
}

export async function setPendingError(id: number, message: string | null) {
  await prisma.pendingInvoice.update({ where: { id }, data: { lastError: message?.slice(0, 500) ?? null } }).catch(() => {});
}

export async function deletePendingInvoice(id: number): Promise<boolean> {
  const p = await prisma.pendingInvoice.findUnique({ where: { id }, select: { files: true } });
  if (!p) return false;
  await prisma.pendingInvoice.delete({ where: { id } });
  for (const f of p.files) await removeInvoiceFile(f);
  return true;
}

/**
 * La facture vient d'être enregistrée : ses pages deviennent son fichier joint
 * (sans limite de poids : ce sont des pages déjà acceptées) et elle quitte la
 * liste « À traiter ». Rend false si le fichier n'a pas pu être joint (la
 * facture à traiter est alors gardée, pour ne rien perdre).
 */
export async function finishPendingInvoice(id: number, orderId: number): Promise<boolean> {
  try {
    const doc = await pendingDocument(id);
    const [order, attente] = await Promise.all([
      prisma.purchaseOrder.findUnique({ where: { id: orderId }, select: { filePath: true, note: true } }),
      prisma.pendingInvoice.findUnique({ where: { id }, select: { note: true } }),
    ]);
    if (!order) return false;
    // La remarque tapée en prenant la photo est reprise si la facture n'en a pas.
    if (!order.note && attente?.note) await prisma.purchaseOrder.update({ where: { id: orderId }, data: { note: attente.note } });
    const ext = doc.mime === "application/pdf" ? ".pdf" : (Object.entries(INVOICE_MIME).find(([, m]) => m === doc.mime)?.[0] ?? ".jpg");
    const rel = await saveInvoiceFile(orderId, doc.data, ext === ".jpeg" ? ".jpg" : ext);
    await prisma.purchaseOrder.update({ where: { id: orderId }, data: { filePath: rel } });
    if (order.filePath && order.filePath !== rel) await removeInvoiceFile(order.filePath);
    await deletePendingInvoice(id);
    return true;
  } catch (e) {
    console.error(`Factures à traiter : pages de ${id} non jointes à la facture ${orderId} :`, e instanceof Error ? e.message : e);
    return false;
  }
}
