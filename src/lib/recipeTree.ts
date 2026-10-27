import { adjustToTarget, ingMass, recipeMass, roundScaled, type AdjIngredient } from "./massAdjust";
import { computeLocalCoef } from "./subRecipeCalc";
import type { IngredientPrice } from "./cost";

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
  /** Allergènes cochés sur la fiche de l'ingrédient. */
  allergens?: string[];
  /** Prix d'achat (fiche de l'ingrédient), pour le coût de revient. */
  cost?: IngredientPrice | null;
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
 * `fixedMin`/`fixedMax` : la part qui ne suit pas le multiplicateur de la
 * recette (sous-recettes verrouillées, à tous les niveaux).
 * Mémoïsé par nœud pour éviter de recalculer un sous-arbre partagé.
 */
export type BaseMass = { min: number; max: number; avg: number; fixedMin: number; fixedMax: number };
type MassMemo = Map<TreeNode, BaseMass>;

/**
 * Coefficient local d'une sous-recette. En masse cible, la part verrouillée de
 * l'enfant ne bouge pas : seul le reste est mis à l'échelle pour tomber sur la
 * masse voulue (crème de 500 g avec un insert verrouillé de 100 g → le reste
 * vise 400 g).
 */
function linkLocalCoef(
  link: Pick<TreeLink, "calcMode" | "calcValue" | "pivotIngredientId">,
  child: TreeNode,
  base: BaseMass,
): number {
  if (link.calcMode === "mass_target") {
    const fixed = (base.fixedMin + base.fixedMax) / 2;
    const free = base.avg - fixed;
    if (fixed > 0 && free > 0 && link.calcValue > fixed) return (link.calcValue - fixed) / free;
  }
  return computeLocalCoef(link.calcMode, link.calcValue, base.avg, pivotGrams(child, link.pivotIngredientId));
}

export function treeBaseMass(node: TreeNode, memo: MassMemo = new Map()): BaseMass {
  const cached = memo.get(node);
  if (cached) return cached;

  let min = 0;
  let max = 0;
  let fixedMin = 0;
  let fixedMax = 0;
  for (const ing of node.ingredients) {
    const unit = ing.unit ?? "g";
    min += ingMass(ing.quantityG, unit, ing.pieceG);
    max += ingMass(ing.quantityGMax ?? ing.quantityG, unit, ing.pieceG);
  }
  for (const link of node.subLinks) {
    const cb = treeBaseMass(link.child, memo);
    const k = linkLocalCoef(link, link.child, cb);
    // La part verrouillée de l'enfant ne suit pas son coefficient.
    const lMin = (cb.min - cb.fixedMin) * k + cb.fixedMin;
    const lMax = (cb.max - cb.fixedMax) * k + cb.fixedMax;
    min += lMin;
    max += lMax;
    if (link.isLocked) {
      fixedMin += lMin;
      fixedMax += lMax;
    } else {
      fixedMin += cb.fixedMin;
      fixedMax += cb.fixedMax;
    }
  }
  const r = { min, max, avg: (min + max) / 2, fixedMin, fixedMax };
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
      cost: ing.cost ?? null,
    };
  }
  return {
    name: ing.name,
    quantityG: round(ing.quantityG * coef),
    quantityGMax: ing.quantityGMax != null ? round(ing.quantityGMax * coef) : null,
    unit: ing.unit ?? "g",
    pieceG: ing.pieceG ?? null,
    cost: ing.cost ?? null,
  };
}

/**
 * Liste à plat de TOUS les ingrédients d'une recette (les siens + ceux de ses
 * sous-recettes imbriquées), mise à l'échelle par `coef`.
 * - arrondi au gramme supérieur seulement quand on multiplie (coef ≠ 1) ;
 * - chaque sous-recette garde son mode (coef / masse cible / pivot), son
 *   verrouillage (ignore `coef`) et son « masse exacte ».
 * `fixed[i]` est vrai pour un ingrédient venu d'une sous-recette verrouillée
 * (à ne pas retoucher pour viser une masse exacte).
 */
function expand(node: TreeNode, coef: number, memo: MassMemo): { ingredients: AdjIngredient[]; fixed: boolean[] } {
  const ingredients: AdjIngredient[] = node.ingredients.map((ing) => scaleLeaf(ing, coef));
  const fixed: boolean[] = ingredients.map(() => false);
  for (const link of node.subLinks) {
    const r = resolveParts(link, coef, memo);
    ingredients.push(...r.ingredients);
    fixed.push(...r.fixed.map((f) => f || link.isLocked));
  }
  return { ingredients, fixed };
}

type LinkInput = Pick<TreeLink, "calcMode" | "calcValue" | "pivotIngredientId" | "isLocked" | "isExact" | "child">;

function resolveParts(link: LinkInput, parentCoef: number, memo: MassMemo) {
  const child = link.child;
  const localCoef = linkLocalCoef(link, child, treeBaseMass(child, memo));
  const effectiveCoef = link.isLocked ? localCoef : localCoef * parentCoef;

  let { ingredients, fixed } = expand(child, effectiveCoef, memo);
  if (link.isExact && link.calcMode === "mass_target") {
    // Seule la part qui suit est ajustée : un insert verrouillé n'est pas raboté.
    const target = Math.round(link.calcValue * (link.isLocked ? 1 : parentCoef));
    const fixedMass = recipeMass(ingredients.filter((_, i) => fixed[i])).avg;
    if (target > fixedMass) {
      const idx = ingredients.map((_, i) => i).filter((i) => !fixed[i]);
      const adjusted = adjustToTarget(idx.map((i) => ingredients[i]), target - fixedMass).ingredients;
      ingredients = [...ingredients];
      idx.forEach((i, j) => (ingredients[i] = adjusted[j]));
    }
  }
  return { effectiveCoef, ingredients, fixed };
}

/**
 * Résout une sous-recette (un lien parent→enfant) pour un multiplicateur parent
 * donné : coefficient effectif, liste complète des ingrédients (imbriqués
 * compris) et masse min/max.
 */
export function resolveLink(
  link: LinkInput,
  parentCoef: number,
  memo: MassMemo = new Map(),
): { effectiveCoef: number; ingredients: AdjIngredient[]; min: number; max: number } {
  const { effectiveCoef, ingredients } = resolveParts(link, parentCoef, memo);
  const { min, max } = recipeMass(ingredients);
  return { effectiveCoef, ingredients, min, max };
}
