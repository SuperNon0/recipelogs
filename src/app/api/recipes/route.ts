import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Liste légère des recettes pour l'autocomplétion de la modal
 * « Ajouter des recettes au dossier ».
 *
 * Query params :
 *  - q                : filtre par nom (contains, insensitive)
 *  - onlyNoFolder     : "1" pour ne renvoyer que les recettes sans dossier
 *  - excludeFolder=ID : exclure les recettes déjà rangées dans ce dossier
 *  - limit            : max résultats (défaut 50, max 200)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const onlyNoFolder = url.searchParams.get("onlyNoFolder") === "1";
  const excludeFolderRaw = url.searchParams.get("excludeFolder");
  const limitRaw = url.searchParams.get("limit");
  const limit = Math.min(
    Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1),
    200,
  );

  const where: import("@prisma/client").Prisma.RecipeWhereInput = {};
  if (q.trim()) {
    where.name = { contains: q.trim(), mode: "insensitive" };
  }
  if (onlyNoFolder) {
    where.folderId = null;
  } else if (excludeFolderRaw && /^\d+$/.test(excludeFolderRaw)) {
    const fid = Number(excludeFolderRaw);
    where.OR = [{ folderId: null }, { folderId: { not: fid } }];
  }

  const recipes = await prisma.recipe.findMany({
    where,
    select: {
      id: true,
      name: true,
      folderId: true,
      folder: { select: { name: true, color: true } },
    },
    orderBy: { name: "asc" },
    take: limit,
  });

  return NextResponse.json({ recipes });
}
