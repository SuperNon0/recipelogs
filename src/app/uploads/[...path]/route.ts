import { readFile } from "node:fs/promises";
import { imageMime, uploadFilePath } from "@/lib/uploads";

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
  const type = file ? imageMime(file) : null;
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
