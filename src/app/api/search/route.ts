import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/recipes";

/**
 * Recherche globale (fenêtre Ctrl K) : recettes, dossiers, ingrédients, cahiers et
 * listes de courses dont le nom contient le texte saisi.
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ recipes: [], folders: [], ingredients: [], cookbooks: [], lists: [] });

  const normalized = normalizeForSearch(q);
  const contains = { contains: q, mode: "insensitive" as const };

  const [recipes, folders, ingredients, cookbooks, lists] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        OR: [
          { nameNormalized: { contains: normalized, mode: "insensitive" } },
          { name: contains },
        ],
      },
      select: { id: true, name: true, folder: { select: { name: true, color: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    prisma.folder.findMany({
      where: { name: contains },
      select: { id: true, name: true, color: true, _count: { select: { recipes: true } } },
      take: 4,
    }),
    prisma.ingredientBase.findMany({
      where: { name: contains },
      select: { id: true, name: true, _count: { select: { usages: true } } },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.cookbook.findMany({
      where: { name: contains },
      select: { id: true, name: true },
      take: 4,
    }),
    prisma.shoppingList.findMany({
      where: { name: contains },
      select: { id: true, name: true },
      take: 4,
    }),
  ]);

  return NextResponse.json({
    recipes: recipes.map((r) => ({ id: r.id, name: r.name, folder: r.folder?.name ?? null, color: r.folder?.color ?? null })),
    folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes })),
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, uses: i._count.usages })),
    cookbooks,
    lists,
  });
}
