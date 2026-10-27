import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeForSearch } from "@/lib/recipes";
import { formatQty } from "@/lib/format";
import { ingredientTerms, recipesWithIngredients, searchableText, snippet } from "@/lib/textSearch";

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

/** Recettes qui contiennent l'ingrédient (ou tous les ingrédients séparés par +), sous-recettes comprises. */
async function searchByIngredient(q: string) {
  const terms = ingredientTerms(q);
  if (!terms.length) return [];
  const [uses, links] = await Promise.all([
    prisma.ingredient.findMany({
      where: { unit: { not: "titre" }, name: { not: null } },
      select: { recipeId: true, name: true, quantityG: true, unit: true },
    }),
    prisma.subRecipe.findMany({ select: { parentId: true, childId: true, label: true } }),
  ]);
  const hits = recipesWithIngredients(
    terms,
    uses.map((u) => ({ recipeId: u.recipeId, name: u.name ?? "", quantityG: Number(u.quantityG), unit: u.unit })),
    links,
  );
  if (!hits.size) return [];
  const names = await prisma.recipe.findMany({ where: { id: { in: [...hits.keys()] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return names.map((r) => ({
    id: r.id,
    name: r.name,
    detail: hits
      .get(r.id)!
      .map((h) => (h.via ? `${h.name} (dans ${h.via})` : h.unit === "QS" || h.quantityG == null ? h.name : `${h.name} ${formatQty(h.quantityG, h.unit)}`))
      .join(" · "),
  }));
}

/** Recettes dont les étapes, les notes ou les commentaires contiennent le texte, avec un extrait. */
async function searchInText(q: string) {
  if (q.length < 3 || q.includes("+")) return [];
  const [steps, notes, comments] = await Promise.all([
    prisma.stepsBlock.findMany({ select: { recipeId: true, content: true, recipe: { select: { name: true } } } }),
    prisma.recipe.findMany({ where: { notesTips: { not: null } }, select: { id: true, name: true, notesTips: true } }),
    prisma.comment.findMany({ select: { recipeId: true, content: true, recipe: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  const out: { id: number; name: string; where: string; before: string; match: string; after: string }[] = [];
  const seen = new Set<number>();
  const add = (id: number, name: string, where: string, text: string) => {
    if (seen.has(id)) return;
    const s = snippet(searchableText(text), q);
    if (!s) return;
    seen.add(id);
    out.push({ id, name, where, ...s });
  };
  for (const st of steps) add(st.recipeId, st.recipe.name, "Étapes", st.content);
  for (const n of notes) add(n.id, n.name, "Notes", n.notesTips ?? "");
  for (const c of comments) add(c.recipeId, c.recipe.name, "Essais", c.content);
  return out;
}
