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

// Calcul pur (sans base de données), utilisable côté navigateur.
export { computeLocalCoef } from "./subRecipeCalc";
