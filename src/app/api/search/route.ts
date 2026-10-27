import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/recipes";
import { searchByIngredient, searchInText } from "@/lib/fullSearch";
import { foldText } from "@/lib/textSearch";

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
  // Sans accents ni majuscules (« creme » trouve « Crème », « oeufs » trouve « Œufs ») :
  // ces listes sont petites, on les filtre ici plutôt qu'en base.
  const has = (name: string) => foldText(name).includes(normalized);

  const [byName, essays, folders, ingredients, cookbooks, lists] = await Promise.all([
    prisma.recipe.findMany({
      where: {
        OR: [
          { nameNormalized: { contains: normalized, mode: "insensitive" } },
          { name: contains },
        ],
      },
      select: { id: true, name: true, updatedAt: true, folder: { select: { name: true, color: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    // Petit nom d'un essai (« moins sucré »).
    prisma.variant.findMany({
      where: { note: { not: null } },
      select: { note: true, variant: { select: { id: true, name: true, updatedAt: true, folder: { select: { name: true, color: true } } } } },
    }),
    prisma.folder.findMany({ select: { id: true, name: true, color: true, _count: { select: { recipes: true } } }, orderBy: { name: "asc" } }),
    prisma.ingredientBase.findMany({ select: { id: true, name: true, _count: { select: { usages: true } } }, orderBy: { name: "asc" } }),
    prisma.cookbook.findMany({ select: { id: true, name: true } }),
    prisma.shoppingList.findMany({ select: { id: true, name: true } }),
  ]);
  const recipes = [
    ...byName,
    ...essays.filter((e) => has(e.note ?? "") && !byName.some((r) => r.id === e.variant.id)).map((e) => e.variant),
  ].slice(0, 8);

  const [withIngredient, inText] = await Promise.all([searchByIngredient(q), searchInText(q)]);
  // Une recette déjà trouvée par son nom n'est pas répétée plus bas.
  const shown = new Set(recipes.map((r) => r.id));

  return NextResponse.json({
    recipes: recipes.map((r) => ({ id: r.id, name: r.name, folder: r.folder?.name ?? null, color: r.folder?.color ?? null })),
    folders: folders.filter((f) => has(f.name)).slice(0, 4).map((f) => ({ id: f.id, name: f.name, color: f.color, count: f._count.recipes })),
    ingredients: ingredients.filter((i) => has(i.name)).slice(0, 5).map((i) => ({ id: i.id, name: i.name, uses: i._count.usages })),
    cookbooks: cookbooks.filter((c) => has(c.name)).slice(0, 4),
    lists: lists.filter((l) => has(l.name)).slice(0, 4),
    withIngredient: withIngredient.filter((r) => !shown.has(r.id)).slice(0, 8),
    inText: inText.filter((r) => !shown.has(r.id) && !withIngredient.some((w) => w.id === r.id)).slice(0, 8),
  });
}
