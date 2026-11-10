import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
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
