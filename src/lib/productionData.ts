import { prisma } from "./prisma";
import { loadRecipeTree } from "./recipes";
import { buildProduction, productionCoef, type ProductionInput } from "./production";

/** Ce qui est demandé, en clair : « 60 éclairs » ou « ×2 ». */
export function productionTarget(amount: number, yieldCount: number | null, yieldLabel: string | null): string {
  const n = amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return yieldCount ? `${n} ${yieldLabel?.trim() || "pièces"}` : `×${n}`;
}

/** Recettes de la fiche de production en cours, dans l'ordre d'ajout. */
export async function listProductionItems() {
  const rows = await prisma.productionItem.findMany({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, yieldCount: true, recipe: { select: { id: true, name: true, yieldLabel: true } } },
  });
  // `yieldCount` : rendement au moment de l'ajout (la quantité est alors en pièces), sinon null (multiplicateur).
  return rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe.id,
    name: r.recipe.name,
    amount: Number(r.amount),
    yieldCount: r.yieldCount,
    yieldLabel: r.yieldCount ? r.recipe.yieldLabel?.trim() || "pièces" : null,
  }));
}

export type ProductionItemRow = Awaited<ReturnType<typeof listProductionItems>>[number];

/** Fiche complète (blocs de pesées + total par ingrédient) pour des recettes et leurs quantités. */
export async function buildProductionSheet(entries: { recipeId: number; amount: number; yieldCount?: number | null }[]) {
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: entries.map((e) => e.recipeId) } },
    select: { id: true, yieldCount: true, yieldLabel: true },
  });
  const inputs: ProductionInput[] = [];
  for (const e of entries) {
    const r = recipes.find((x) => x.id === e.recipeId);
    const tree = r ? await loadRecipeTree(e.recipeId) : null;
    if (!r || !tree) continue;
    // Quantité en pièces (rendement noté à l'ajout) : on divise par le rendement
    // actuel de la recette, ou par celui de l'ajout s'il a été effacé depuis.
    const pieces = e.yieldCount === undefined ? r.yieldCount : e.yieldCount;
    const yieldNow = pieces ? (r.yieldCount && r.yieldCount > 0 ? r.yieldCount : pieces) : null;
    inputs.push({ tree, coef: productionCoef(e.amount, yieldNow), target: productionTarget(e.amount, yieldNow, r.yieldLabel) });
  }
  return buildProduction(inputs);
}

export type ProductionSheet = Awaited<ReturnType<typeof buildProductionSheet>>;
