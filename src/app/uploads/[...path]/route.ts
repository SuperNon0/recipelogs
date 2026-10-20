import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { uploadFilePath } from "@/lib/uploads";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Sert les fichiers du dossier d'upload. Nécessaire car Next.js ne sert que
 * les fichiers présents dans `public/` au moment du build.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const file = uploadFilePath(path);
  const type = file ? MIME[extname(file).toLowerCase()] : undefined;
  if (!file || !type) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(file);
    return new Response(bytes, {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
