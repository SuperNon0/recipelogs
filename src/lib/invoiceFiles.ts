import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { prisma } from "./prisma";
import { uploadFilePath } from "./uploads";

/** Photo ou PDF d'une facture, rangé dans le dossier d'upload sous factures/. */
export const INVOICE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

export const INVOICE_MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES) || 10 * 1024 * 1024;

export function invoiceExt(fileName: string, mime: string): string | null {
  const ext = extname(fileName).toLowerCase();
  if (INVOICE_MIME[ext]) return ext === ".jpeg" ? ".jpg" : ext;
  const fromMime = Object.entries(INVOICE_MIME).find(([, m]) => m === mime)?.[0];
  return fromMime ? (fromMime === ".jpeg" ? ".jpg" : fromMime) : null;
}

/** Enregistre le fichier et renvoie son chemin relatif (« factures/12-ab12cd.pdf »). */
export async function saveInvoiceFile(orderId: number, bytes: Buffer, ext: string): Promise<string> {
  const rel = `factures/${orderId}-${randomBytes(4).toString("hex")}${ext}`;
  const abs = uploadFilePath(rel.split("/"));
  if (!abs) throw new Error("Chemin de fichier invalide.");
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return rel;
}

export async function readInvoiceFile(rel: string): Promise<{ bytes: Buffer; type: string } | null> {
  const abs = uploadFilePath(rel.split("/"));
  const type = INVOICE_MIME[extname(rel).toLowerCase()];
  if (!abs || !type) return null;
  try {
    return { bytes: await readFile(abs), type };
  } catch {
    return null;
  }
}

export async function removeInvoiceFile(rel: string | null | undefined) {
  if (!rel) return;
  const abs = uploadFilePath(rel.split("/"));
  if (abs) await unlink(abs).catch(() => {});
}

/** Le contenu ressemble-t-il vraiment à un PDF ou une image ? (on ne se fie pas qu'au nom) */
export function sniffInvoiceExt(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return ".pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ".jpg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ".png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return ".webp";
  return null;
}

/** Joint un fichier à une facture (remplace l'ancien). */
export async function attachInvoiceFile(orderId: number, bytes: Buffer): Promise<{ type: string }> {
  if (bytes.length === 0) throw new Error("fichier vide");
  if (bytes.length > INVOICE_MAX_BYTES) throw new Error("fichier trop lourd");
  const ext = sniffInvoiceExt(bytes);
  if (!ext) throw new Error("PDF ou photo (JPG, PNG, WebP) seulement");
  const order = await prisma.purchaseOrder.findUnique({ where: { id: orderId }, select: { filePath: true } });
  if (!order) throw new Error("facture introuvable");
  const rel = await saveInvoiceFile(orderId, bytes, ext);
  await prisma.purchaseOrder.update({ where: { id: orderId }, data: { filePath: rel } });
  if (order.filePath !== rel) await removeInvoiceFile(order.filePath);
  return { type: ext === ".pdf" ? "pdf" : "image" };
}

// Liens d'envoi à usage unique (30 min), donnés par l'outil MCP joindre_fichier_facture.
const UPLOAD_TTL_MS = 30 * 60 * 1000;
// Rangés sur globalThis : la route d'envoi et l'outil MCP doivent voir la même liste.
const g = globalThis as unknown as { __rlInvoiceUploads?: Map<string, { orderId: number; expires: number }> };
const uploadLinks = (g.__rlInvoiceUploads ??= new Map());

export function createUploadLink(orderId: number): { token: string; expires: Date } {
  const now = Date.now();
  for (const [t, v] of uploadLinks) if (v.expires < now) uploadLinks.delete(t);
  const token = randomBytes(24).toString("base64url");
  const expires = now + UPLOAD_TTL_MS;
  uploadLinks.set(token, { orderId, expires });
  return { token, expires: new Date(expires) };
}

/** Consomme le lien : renvoie la facture visée, ou null s'il est inconnu ou expiré. */
export function consumeUploadLink(token: string): number | null {
  const v = uploadLinks.get(token);
  uploadLinks.delete(token);
  return v && v.expires >= Date.now() ? v.orderId : null;
}
