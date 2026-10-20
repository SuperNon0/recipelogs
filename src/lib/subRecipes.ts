import { prisma } from "./prisma";

/**
 * Vérifie qu'ajouter childId comme sous-recette de parentId ne crée pas de cycle :
 * parcourt en UNE requête (CTE récursive) tous les descendants de childId ;
 * si parentId en fait partie, il y aurait cycle. `UNION` (sans ALL) évite
 * de boucler si la base contient déjà un cycle.
 */
export async function hasCycle(parentId: number, childId: number): Promise<boolean> {
  if (parentId === childId) return true;
  const rows = await prisma.$queryRaw<{ found: number }[]>`
    WITH RECURSIVE descendants(id) AS (
      SELECT child_id FROM sub_recipes WHERE parent_id = ${childId}
      UNION
      SELECT s.child_id FROM sub_recipes s JOIN descendants d ON s.parent_id = d.id
    )
    SELECT 1 AS found FROM descendants WHERE id = ${parentId} LIMIT 1
  `;
  return rows.length > 0;
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
