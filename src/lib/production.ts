import { adjustToTarget, ingMass, roundScaled } from "./massAdjust";
import { resolveLink, type TreeNode } from "./recipeTree";

/**
 * Fiche de production : pour une ou plusieurs recettes à produire, toutes les
 * pesées à l'échelle, regroupées par préparation (une préparation = la recette
 * ou une de ses sous-recettes, à tous les niveaux), dans l'ordre de fabrication
 * (les sous-recettes avant la recette qui les utilise). Une sous-recette
 * utilisée par plusieurs recettes n'a qu'un bloc, aux quantités additionnées.
 * Contrairement à la fiche, tout suit la quantité demandée, sous-recettes
 * verrouillées comprises. Pur (aucun accès base).
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

/** Pesées d'une préparation, arrondies une seule fois sur le coefficient total.
 * `exactG` : masse à atteindre pile (« masse exacte »), sinon null. */
function ownLines(node: TreeNode, coef: number, exactG: number | null): ProductionLine[] {
  let lines = node.ingredients.map((i): ProductionLine => {
    if (i.unit === "titre") return { kind: "title", name: i.name };
    const unit = i.unit ?? "g";
    // Fourchette : on pèse le haut (comme les listes de courses).
    const { qty, unit: u } = scaled(i.quantityGMax ?? i.quantityG, unit, coef);
    return { kind: "ing", name: i.name, qty: unit === "QS" ? 0 : qty, unit: u, grams: ingMass(qty, u, i.pieceG) };
  });
  if (exactG !== null && exactG > 0) {
    const idx = lines.flatMap((l, i) => (l.kind === "ing" ? [i] : []));
    const adj = adjustToTarget(
      idx.map((i) => {
        const l = lines[i] as Extract<ProductionLine, { kind: "ing" }>;
        return { name: l.name, quantityG: l.qty, quantityGMax: null, unit: l.unit, pieceG: l.qty > 0 ? l.grams / l.qty : null };
      }),
      Math.round(exactG),
    ).ingredients;
    lines = [...lines];
    idx.forEach((i, j) => {
      const l = lines[i] as Extract<ProductionLine, { kind: "ing" }>;
      lines[i] = { ...l, qty: adj[j].quantityG, grams: ingMass(adj[j].quantityG, l.unit, adj[j].pieceG) };
    });
  }
  return lines;
}

/** En production, tout suit la quantité demandée : les verrous sont levés (à tous les niveaux). */
function unlock(node: TreeNode, seen = new Map<TreeNode, TreeNode>()): TreeNode {
  const done = seen.get(node);
  if (done) return done;
  const copy: TreeNode = { ...node, subLinks: [] };
  seen.set(node, copy);
  copy.subLinks = node.subLinks.map((l) => ({ ...l, isLocked: false, child: unlock(l.child, seen) }));
  return copy;
}

type Acc = {
  node: TreeNode;
  block: Omit<ProductionBlock, "lines" | "massG" | "coef">;
  coef: number;
  /** Somme des masses exactes demandées, ou null dès qu'un usage n'est pas « exact ». */
  exactG: number | null;
};

export function buildProduction(inputs: ProductionInput[]): { blocks: ProductionBlock[]; totals: ProductionTotal[]; massG: number } {
  const order: Acc[] = [];
  const byKey = new Map<string, Acc>();

  // On additionne d'abord les coefficients (sans arrondir) : une préparation
  // partagée est arrondie une seule fois (0,4 + 0,4 œuf = 1 œuf, pas 2).
  const put = (key: string, node: TreeNode, block: Acc["block"], coef: number, exactG: number | null) => {
    const existing = byKey.get(key);
    if (!existing) {
      const acc = { node, block, coef, exactG };
      byKey.set(key, acc);
      order.push(acc);
      return;
    }
    existing.coef += coef;
    existing.exactG = existing.exactG !== null && exactG !== null ? existing.exactG + exactG : null;
    for (const u of block.usedIn) if (!existing.block.usedIn.includes(u)) existing.block.usedIn.push(u);
  };

  const walk = (node: TreeNode, coef: number, usedIn: string | null, target?: string, exactG: number | null = null) => {
    // Sous-recettes d'abord : on les prépare avant la recette qui les utilise.
    const memo = new Map();
    for (const link of node.subLinks) {
      const { effectiveCoef } = resolveLink(link, coef, memo);
      // « Masse exacte » tenue seulement pour une préparation sans sous-recette
      // (sinon sa masse est répartie sur plusieurs blocs).
      const exact = link.isExact && link.calcMode === "mass_target" && link.child.subLinks.length === 0 ? link.calcValue * coef : null;
      walk(link.child, effectiveCoef, node.name, undefined, exact);
    }
    if (usedIn === null) {
      // Recette demandée : toujours son propre bloc (même si demandée deux fois, les quantités s'additionnent).
      put(`p:${node.id}`, node, { recipeId: node.id, name: node.name, usedIn: [], isProduct: true, target, steps: node.steps }, coef, null);
    } else if (node.ingredients.some((i) => i.unit !== "titre")) {
      put(`s:${node.id}`, node, { recipeId: node.id, name: node.name, usedIn: [usedIn], isProduct: false, steps: node.steps }, coef, exactG);
    }
  };

  for (const input of inputs) walk(unlock(input.tree), input.coef, null, input.target);

  const blocks: ProductionBlock[] = order.map(({ node, block, coef, exactG }) => {
    const lines = ownLines(node, coef, exactG);
    const massG = lines.reduce((s, l) => s + (l.kind === "ing" ? l.grams : 0), 0);
    return { ...block, lines, massG, coef };
  });

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
