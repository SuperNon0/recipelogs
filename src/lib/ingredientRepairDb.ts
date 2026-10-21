import { prisma } from "./prisma";
import { planIngredientRepair } from "./ingredientRepair";
import { isQuantityOnly } from "./parseIngredientsText";

/** recipes : recettes corrigées ; fixed : lignes corrigées ou supprimées ; basesRemoved : bases inutiles supprimées. */
export type RepairReport = { recipes: number; fixed: number; basesRemoved: number };

/**
 * Applique la réparation « quantité sur sa propre ligne » à toutes les recettes,
 * puis supprime les ingrédients de base devenus inutiles (« 800g »…).
 */
export async function repairImportedIngredients(): Promise<RepairReport> {
  const suspects = await prisma.ingredient.findMany({
    where: { name: { not: null }, quantityG: { gt: 0 } },
    select: { recipeId: true, name: true },
  });
  const recipeIds = [...new Set(suspects.filter((s) => isQuantityOnly(s.name ?? "")).map((s) => s.recipeId))];

  let recipes = 0;
  let fixed = 0;
  for (const recipeId of recipeIds) {
    const rows = await prisma.ingredient.findMany({
      where: { recipeId },
      orderBy: { position: "asc" },
      select: { id: true, name: true, quantityG: true, quantityGMax: true, unit: true },
    });
    const plan = planIngredientRepair(
      rows.map((r) => ({
        id: r.id,
        name: r.name ?? "",
        quantityG: Number(r.quantityG),
        quantityGMax: r.quantityGMax != null ? Number(r.quantityGMax) : null,
        unit: r.unit,
      })),
    );
    if (plan.deletes.length === 0) continue;
    await prisma.$transaction([
      ...plan.updates.map((u) =>
        prisma.ingredient.update({
          where: { id: u.id },
          data: { quantityG: u.quantityG, quantityGMax: u.quantityGMax, unit: u.unit },
        }),
      ),
      prisma.ingredient.deleteMany({ where: { id: { in: plan.deletes } } }),
    ]);
    recipes++;
    fixed += plan.deletes.length;
  }

  // Bases « quantité seule » qui ne servent plus à aucune recette.
  const bases = await prisma.ingredientBase.findMany({
    select: { id: true, name: true, _count: { select: { usages: true } } },
  });
  const orphanIds: number[] = [];
  for (const b of bases) {
    if (!isQuantityOnly(b.name) || b._count.usages > 0) continue;
    const sameName = await prisma.ingredient.count({ where: { name: { equals: b.name, mode: "insensitive" } } });
    if (sameName === 0) orphanIds.push(b.id);
  }
  if (orphanIds.length) await prisma.ingredientBase.deleteMany({ where: { id: { in: orphanIds } } });

  return { recipes, fixed, basesRemoved: orphanIds.length };
}

const DONE_KEY = "ingredientRepairV1";

/** Réparation automatique, une seule fois par base (au démarrage du serveur). */
export async function repairImportedIngredientsOnce(): Promise<RepairReport | null> {
  const done = await prisma.setting.findUnique({ where: { key: DONE_KEY } });
  if (done) return null;
  const report = await repairImportedIngredients();
  await prisma.setting.upsert({
    where: { key: DONE_KEY },
    update: { value: { ...report, at: new Date().toISOString() } },
    create: { key: DONE_KEY, value: { ...report, at: new Date().toISOString() } },
  });
  return report;
}
