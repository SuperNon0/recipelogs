import { prisma } from "./prisma";

/**
 * Vérifie qu'ajouter childId comme sous-recette de parentId ne crée pas de cycle.
 * Explore l'arbre descendant de childId : si parentId est atteint, il y aurait cycle.
 * Complexité : O(n) où n = nombre total de liens sous-recette.
 */
export async function hasCycle(parentId: number, childId: number): Promise<boolean> {
  if (parentId === childId) return true;

  const queue: number[] = [childId];
  const visited = new Set<number>([childId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const links = await prisma.subRecipe.findMany({
      where: { parentId: current },
      select: { childId: true },
    });
    for (const link of links) {
      if (link.childId === parentId) return true;
      if (!visited.has(link.childId)) {
        visited.add(link.childId);
        queue.push(link.childId);
      }
    }
  }
  return false;
}

/**
 * Calcule le coefficient local effectif d'une sous-recette
 * selon son mode et les ingrédients de la recette enfant.
 */
export function computeLocalCoef(
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient",
  calcValue: number,
  childBaseTotalG: number,
  pivotBaseQtyG: number | null,
): number {
  if (calcMode === "coefficient") {
    return Number.isFinite(calcValue) && calcValue > 0 ? calcValue : 1;
  }
  if (calcMode === "mass_target") {
    if (childBaseTotalG <= 0) return 1;
    return calcValue / childBaseTotalG;
  }
  // pivot_ingredient
  if (!pivotBaseQtyG || pivotBaseQtyG <= 0) return 1;
  return calcValue / pivotBaseQtyG;
}
