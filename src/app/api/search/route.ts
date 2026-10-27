import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/recipes";
import { searchByIngredient, searchInText } from "@/lib/fullSearch";

/**
 * Recherche globale (fenêtre Ctrl K) : recettes, dossiers, ingrédients, cahiers et
 * listes de courses dont le nom contient le texte saisi ; recettes qui utilisent
 * l'ingrédient cherché (sous-recettes comprises, « jaunes + crème » pour
 * plusieurs) ; recettes dont les étapes, les notes ou les commentaires le
 * contiennent (avec un extrait).
 */
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ recipes: [], folders: [], ingredients: [], cookbooks: [], lists: [], withIngredient: [], inText: [] });

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

  const [withIngredient, inText] = await Promise.all([searchByIngredient(q), searchInText(q)]);
  // Une recette déjà trouvée par son nom n'est pas répétée plus bas.
  const shown = new Set(recipes.map((r) => r.id));

  return NextResponse.json({
    recipes: recipes.map((r) => ({ id: r.id, name: r.name, folder: r.folder?.name ?? null, color: r.folder?.color ?? null })),
    folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes })),
    ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, uses: i._count.usages })),
    cookbooks,
    lists,
    withIngredient: withIngredient.filter((r) => !shown.has(r.id)).slice(0, 8),
    inText: inText.filter((r) => !shown.has(r.id) && !withIngredient.some((w) => w.id === r.id)).slice(0, 8),
  });
}
