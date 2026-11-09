import { readFile } from "node:fs/promises";
import { imageMime, uploadFilePath, uploadUrl } from "@/lib/uploads";
import { apiDenied } from "@/lib/auth/guard";
import { prisma } from "@/lib/prisma";
import { visibleRecipeIds } from "@/lib/auth/visibility";

/**
 * Sert les fichiers du dossier d'upload. Nécessaire car Next.js ne sert que
 * les fichiers présents dans `public/` au moment du build.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const denied = await apiDenied("read");
  if (denied) return denied;
  const { path } = await params;
  const visible = await visibleRecipeIds();
  if (visible && !(await prisma.recipe.findFirst({
    where: { id: { in: [...visible] }, photoPath: uploadUrl(...path) },
    select: { id: true },
  }))) return new Response("Not found", { status: 404 });
  const file = uploadFilePath(path);
  const type = file ? imageMime(file) : null;
  if (!file || !type) return new Response("Not found", { status: 404 });
  try {
    const bytes = await readFile(file);
    return new Response(bytes, {
      headers: { "Content-Type": type, "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
