import { ingMass, roundScaled } from "./massAdjust";
import { resolveLink, type TreeNode } from "./recipeTree";

/**
 * Fiche de production : pour une ou plusieurs recettes à produire, toutes les
 * pesées à l'échelle, regroupées par préparation (une préparation = la recette
 * ou une de ses sous-recettes, à tous les niveaux), dans l'ordre de fabrication
 * (les sous-recettes avant la recette qui les utilise). Une sous-recette
 * utilisée par plusieurs recettes n'a qu'un bloc, aux quantités additionnées.
 * Pur (aucun accès base).
 */

export type ProductionLine =
  | { kind: "title"; name: string }
  | { kind: "ing"; name: string; qty: number; unit: string; grams: number };

export type ProductionBlock = {
  /** Id de la recette (une préparation partagée n'a qu'un bloc). */
  recipeId: number;
  name: string;
  /** Recettes (ou préparations) qui l'utilisent, pour un bloc de sous-recette. */
  usedIn: string[];
  /** Vrai pour une recette demandée (et non une de ses sous-recettes). */
  isProduct: boolean;
  /** Ce qui est demandé (« 60 éclairs », « ×2 »), pour une recette demandée. */
  target?: string;
  lines: ProductionLine[];
  massG: number;
  /** Étapes de la préparation (texte brut) et coefficient total, pour les imprimer à l'échelle. */
  steps: string | null;
  coef: number;
};

export type ProductionTotal = { name: string; qty: number | null; unit: string };

export type ProductionInput = { tree: TreeNode; coef: number; target?: string };

/** Quantité multipliée, arrondie comme partout (gramme supérieur, pièce la plus proche) ; L → g. */
function scaled(q: number, unit: string, coef: number): { qty: number; unit: string } {
  const round = coef === 1 ? (x: number) => x : (x: number) => roundScaled(x, unit);
  if (unit === "L") return { qty: round(q * coef * 1000), unit: "g" };
  return { qty: round(q * coef), unit };
}

function ownLines(node: TreeNode, coef: number): ProductionLine[] {
  return node.ingredients.map((i): ProductionLine => {
    if (i.unit === "titre") return { kind: "title", name: i.name };
    const unit = i.unit ?? "g";
    // Fourchette : on pèse le haut (comme les listes de courses).
    const { qty, unit: u } = scaled(i.quantityGMax ?? i.quantityG, unit, coef);
    return { kind: "ing", name: i.name, qty: unit === "QS" ? 0 : qty, unit: u, grams: ingMass(qty, u, i.pieceG) };
  });
}

/** Additionne deux listes de pesées de la même recette (même ordre d'ingrédients). */
function addLines(a: ProductionLine[], b: ProductionLine[]): ProductionLine[] {
  return a.map((l, i) => {
    const o = b[i];
    if (l.kind !== "ing" || !o || o.kind !== "ing") return l;
    return { ...l, qty: l.qty + o.qty, grams: l.grams + o.grams };
  });
}

export function buildProduction(inputs: ProductionInput[]): { blocks: ProductionBlock[]; totals: ProductionTotal[]; massG: number } {
  const blocks: ProductionBlock[] = [];
  const byKey = new Map<string, ProductionBlock>();

  const put = (key: string, block: ProductionBlock) => {
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, block);
      blocks.push(block);
      return;
    }
    existing.lines = addLines(existing.lines, block.lines);
    existing.massG += block.massG;
    existing.coef += block.coef;
    for (const u of block.usedIn) if (!existing.usedIn.includes(u)) existing.usedIn.push(u);
  };

  const walk = (node: TreeNode, coef: number, usedIn: string | null, target?: string) => {
    // Sous-recettes d'abord : on les prépare avant la recette qui les utilise.
    const memo = new Map();
    for (const link of node.subLinks) {
      const { effectiveCoef } = resolveLink(link, coef, memo);
      walk(link.child, effectiveCoef, node.name);
    }
    const lines = ownLines(node, coef);
    const massG = lines.reduce((s, l) => s + (l.kind === "ing" ? l.grams : 0), 0);
    if (usedIn === null) {
      // Recette demandée : toujours son propre bloc (même si demandée deux fois, les quantités s'additionnent).
      put(`p:${node.id}`, { recipeId: node.id, name: node.name, usedIn: [], isProduct: true, target, lines, massG, steps: node.steps, coef });
    } else if (lines.some((l) => l.kind === "ing")) {
      put(`s:${node.id}`, { recipeId: node.id, name: node.name, usedIn: [usedIn], isProduct: false, lines, massG, steps: node.steps, coef });
    }
  };

  for (const input of inputs) walk(input.tree, input.coef, null, input.target);

  // Total par ingrédient (même nom et même unité), pour sortir la marchandise.
  const totals = new Map<string, ProductionTotal>();
  for (const b of blocks) {
    for (const l of b.lines) {
      if (l.kind !== "ing") continue;
      const key = `${l.name.trim().toLowerCase()}|${l.unit}`;
      const t = totals.get(key);
      if (l.unit === "QS") {
        if (!t) totals.set(key, { name: l.name.trim(), qty: null, unit: "QS" });
      } else if (t && t.qty !== null) t.qty += l.qty;
      else if (!t) totals.set(key, { name: l.name.trim(), qty: l.qty, unit: l.unit });
    }
  }

  return {
    blocks,
    totals: [...totals.values()].sort((a, b) => a.name.localeCompare(b.name, "fr")),
    massG: blocks.reduce((s, b) => s + b.massG, 0),
  };
}

/** Coefficient pour produire `amount` : un nombre de pièces si la recette a un rendement, sinon un multiplicateur. */
export function productionCoef(amount: number, yieldCount: number | null | undefined): number {
  if (!(amount > 0)) return 1;
  return yieldCount && yieldCount > 0 ? amount / yieldCount : amount;
}
