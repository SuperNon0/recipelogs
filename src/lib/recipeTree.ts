import { adjustToTarget, ingMass, recipeMass, roundScaled, type AdjIngredient } from "./massAdjust";
import { computeLocalCoef } from "./subRecipeCalc";

/**
 * Arbre complet d'une recette avec ses sous-recettes imbriquées (tous niveaux).
 * Pur (aucun accès base), donc utilisable côté client (fiche) comme côté serveur
 * (PDF, cahiers, listes de courses). Le chargement depuis la base est ailleurs
 * (`loadRecipeTree` dans recipes.ts) ; ici on ne fait que le calcul.
 */

export type TreeIngredient = {
  id: number;
  name: string;
  quantityG: number;
  quantityGMax: number | null;
  unit: string;
  /** Poids d'une pièce (fiche de l'ingrédient), pour compter les pièces dans la masse. */
  pieceG?: number | null;
};

export type TreeLink = {
  id: number;
  label: string;
  childId: number;
  childName: string;
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient";
  calcValue: number;
  pivotIngredientId: number | null;
  isLocked: boolean;
  isExact: boolean;
  child: TreeNode;
};

export type TreeNode = {
  id: number;
  name: string;
  steps: string | null;
  ingredients: TreeIngredient[];
  subLinks: TreeLink[];
};

/** Masse en grammes de l'ingrédient pivot (converti depuis son unité). */
function pivotGrams(node: TreeNode, pivotId: number | null): number | null {
  if (!pivotId) return null;
  const ing = node.ingredients.find((i) => i.id === pivotId);
  return ing ? ingMass(ing.quantityG, ing.unit ?? "g", ing.pieceG) : null;
}

/**
 * Masse intrinsèque (à ×1) d'une recette, sous-recettes imbriquées comprises.
 * Sert de base aux calculs « masse cible » et au total affiché.
 * Mémoïsé par nœud pour éviter de recalculer un sous-arbre partagé.
 */
export function treeBaseMass(
  node: TreeNode,
  memo: Map<TreeNode, { min: number; max: number; avg: number }> = new Map(),
): { min: number; max: number; avg: number } {
  const cached = memo.get(node);
  if (cached) return cached;

  let min = 0;
  let max = 0;
  for (const ing of node.ingredients) {
    const unit = ing.unit ?? "g";
    min += ingMass(ing.quantityG, unit, ing.pieceG);
    max += ingMass(ing.quantityGMax ?? ing.quantityG, unit, ing.pieceG);
  }
  for (const link of node.subLinks) {
    const cb = treeBaseMass(link.child, memo);
    const localCoef = computeLocalCoef(
      link.calcMode,
      link.calcValue,
      cb.avg,
      pivotGrams(link.child, link.pivotIngredientId),
    );
    min += cb.min * localCoef;
    max += cb.max * localCoef;
  }
  const r = { min, max, avg: (min + max) / 2 };
  memo.set(node, r);
  return r;
}

/** Applique un coefficient à un ingrédient (L → g). Exact à ×1, arrondi sinon. */
function scaleLeaf(ing: TreeIngredient, coef: number): AdjIngredient {
  const round = coef === 1 ? (x: number) => x : (x: number) => roundScaled(x, ing.unit);
  if (ing.unit === "L") {
    return {
      name: ing.name,
      quantityG: round(ing.quantityG * coef * 1000),
      quantityGMax: ing.quantityGMax != null ? round(ing.quantityGMax * coef * 1000) : null,
      unit: "g",
    };
  }
  return {
    name: ing.name,
    quantityG: round(ing.quantityG * coef),
    quantityGMax: ing.quantityGMax != null ? round(ing.quantityGMax * coef) : null,
    unit: ing.unit ?? "g",
    pieceG: ing.pieceG ?? null,
  };
}

/**
 * Liste à plat de TOUS les ingrédients d'une recette (les siens + ceux de ses
 * sous-recettes imbriquées), mise à l'échelle par `coef`.
 * - arrondi au gramme supérieur seulement quand on multiplie (coef ≠ 1) ;
 * - chaque sous-recette garde son mode (coef / masse cible / pivot), son
 *   verrouillage (ignore `coef`) et son « masse exacte ».
 */
function expand(node: TreeNode, coef: number, memo: Map<TreeNode, { min: number; max: number; avg: number }>): AdjIngredient[] {
  const out: AdjIngredient[] = node.ingredients.map((ing) => scaleLeaf(ing, coef));
  for (const link of node.subLinks) {
    out.push(...resolveLink(link, coef, memo).ingredients);
  }
  return out;
}

/**
 * Résout une sous-recette (un lien parent→enfant) pour un multiplicateur parent
 * donné : coefficient effectif, liste complète des ingrédients (imbriqués
 * compris) et masse min/max.
 */
export function resolveLink(
  link: Pick<TreeLink, "calcMode" | "calcValue" | "pivotIngredientId" | "isLocked" | "isExact" | "child">,
  parentCoef: number,
  memo: Map<TreeNode, { min: number; max: number; avg: number }> = new Map(),
): { effectiveCoef: number; ingredients: AdjIngredient[]; min: number; max: number } {
  const child = link.child;
  const base = treeBaseMass(child, memo);
  const localCoef = computeLocalCoef(
    link.calcMode,
    link.calcValue,
    base.avg,
    pivotGrams(child, link.pivotIngredientId),
  );
  const effectiveCoef = link.isLocked ? localCoef : localCoef * parentCoef;

  let ingredients = expand(child, effectiveCoef, memo);
  if (link.isExact && link.calcMode === "mass_target") {
    const target = Math.round(link.calcValue * (link.isLocked ? 1 : parentCoef));
    ingredients = adjustToTarget(ingredients, target).ingredients;
  }
  const { min, max } = recipeMass(ingredients);
  return { effectiveCoef, ingredients, min, max };
}
