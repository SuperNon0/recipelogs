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
    select: { id: true, amount: true, recipe: { select: { id: true, name: true, yieldCount: true, yieldLabel: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    recipeId: r.recipe.id,
    name: r.recipe.name,
    amount: Number(r.amount),
    yieldCount: r.recipe.yieldCount,
    yieldLabel: r.recipe.yieldLabel?.trim() || (r.recipe.yieldCount ? "pièces" : null),
  }));
}

export type ProductionItemRow = Awaited<ReturnType<typeof listProductionItems>>[number];

/** Fiche complète (blocs de pesées + total par ingrédient) pour des recettes et leurs quantités. */
export async function buildProductionSheet(entries: { recipeId: number; amount: number }[]) {
  const recipes = await prisma.recipe.findMany({
    where: { id: { in: entries.map((e) => e.recipeId) } },
    select: { id: true, yieldCount: true, yieldLabel: true },
  });
  const inputs: ProductionInput[] = [];
  for (const e of entries) {
    const r = recipes.find((x) => x.id === e.recipeId);
    const tree = r ? await loadRecipeTree(e.recipeId) : null;
    if (!r || !tree) continue;
    inputs.push({ tree, coef: productionCoef(e.amount, r.yieldCount), target: productionTarget(e.amount, r.yieldCount, r.yieldLabel) });
  }
  return buildProduction(inputs);
}

export type ProductionSheet = Awaited<ReturnType<typeof buildProductionSheet>>;
