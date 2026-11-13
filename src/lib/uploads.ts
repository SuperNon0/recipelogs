import { extname, isAbsolute, relative, resolve, sep } from "node:path";

/**
 * Dossier des fichiers envoyés (photos importées…).
 * En production il DOIT être hors du dossier de build : le serveur Next.js
 * « standalone » tourne dans `.next/standalone/`, qui est effacé à chaque
 * déploiement. `deploy.sh` / `setup.sh` fixent UPLOAD_DIR=/var/lib/recipelog/uploads.
 */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || "./data/uploads");

/** URL publique d'un fichier du dossier d'upload (servi par /uploads/[...path]). */
export function uploadUrl(...parts: string[]): string {
  return "/uploads/" + parts.map(encodeURIComponent).join("/");
}

/** Chemin disque sûr (refuse toute sortie du dossier d'upload). */
export function uploadFilePath(parts: string[]): string | null {
  // Chaque élément est un segment, jamais un chemin : refuse aussi les alias
  // (« photos/../factures ») avant toute normalisation par le système.
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || /[\\/:\0]/.test(part))) return null;
  const p = resolve(UPLOAD_DIR, ...parts);
  const rel = relative(UPLOAD_DIR, p);
  return rel && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) ? p : null;
}

/** Chemin disque d'une URL « /uploads/... » (null si l'URL n'est pas un upload). */
export function fileFromUploadUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith("/uploads/")) return null;
  return uploadFilePath(url.slice("/uploads/".length).split("/").map(decodeURIComponent));
}

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Type MIME d'une image autorisée (null si l'extension n'est pas une image). */
export function imageMime(file: string): string | null {
  return IMAGE_MIME[extname(file).toLowerCase()] ?? null;
}

