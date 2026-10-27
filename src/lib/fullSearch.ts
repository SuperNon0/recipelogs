import { prisma } from "./prisma";
import { formatQty } from "./format";
import { ingredientTerms, recipesWithIngredients, searchableText, snippet } from "./textSearch";

/**
 * Recherche complète, partagée par la fenêtre de recherche (/api/search) et
 * l'outil MCP recherche_complete : par ingrédient (sous-recettes comprises) et
 * dans le texte (étapes, notes, essais).
 */

/** Recettes qui contiennent l'ingrédient (ou tous les ingrédients séparés par +), sous-recettes comprises. */
export async function searchByIngredient(q: string) {
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
export async function searchInText(q: string) {
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
