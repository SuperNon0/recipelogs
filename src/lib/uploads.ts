import { extname, join, resolve } from "node:path";

/**
 * Dossier des fichiers envoyés (photos importées…).
 * En production il DOIT être hors du dossier de build : le serveur Next.js
 * « standalone » tourne dans `.next/standalone/`, qui est effacé à chaque
 * déploiement. `deploy.sh` / `setup.sh` fixent UPLOAD_DIR=/var/lib/recipelog/uploads.
 */
export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || "./public/uploads");

/** URL publique d'un fichier du dossier d'upload (servi par /uploads/[...path]). */
export function uploadUrl(...parts: string[]): string {
  return "/uploads/" + parts.map(encodeURIComponent).join("/");
}

/** Chemin disque sûr (refuse toute sortie du dossier d'upload). */
export function uploadFilePath(parts: string[]): string | null {
  const p = resolve(join(UPLOAD_DIR, ...parts));
  return p.startsWith(UPLOAD_DIR + "/") ? p : null;
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

