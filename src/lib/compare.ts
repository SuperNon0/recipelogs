import { ingMass } from "./massAdjust";
import { resolveLink, treeBaseMass, type TreeNode } from "./recipeTree";
import { htmlToPlainText } from "./stepsText";

/**
 * Comparaison de deux recettes (variantes) ligne à ligne : ingrédients
 * rapprochés par leur nom (sans accents ni majuscules), sous-recettes par la
 * recette utilisée. Pur : utilisé par la page « Comparer ».
 */

export type CompareRow = {
  key: string;
  name: string;
  /** Masse en grammes (null = absent de cette recette). */
  a: number | null;
  b: number | null;
  /** Unité affichée quand l'ingrédient ne se pèse pas (QS, pièce sans poids). */
  note?: string;
  isSub?: boolean;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Line = { key: string; name: string; g: number; note?: string; isSub?: boolean };

function lines(node: TreeNode): Line[] {
  const out: Line[] = [];
  for (const i of node.ingredients) {
    if (i.unit === "titre") continue;
    const g = ingMass(i.quantityG, i.unit, i.pieceG);
    const note = i.unit === "QS" ? "QS" : i.unit === "pièce" && !(i.pieceG && i.pieceG > 0) ? `${i.quantityG} pièce${i.quantityG > 1 ? "s" : ""}` : undefined;
    out.push({ key: `i:${norm(i.name)}`, name: i.name, g, note });
  }
  const memo = new Map();
  for (const l of node.subLinks) {
    const r = resolveLink(l, 1, memo);
    out.push({ key: `s:${l.childId}`, name: l.label, g: (r.min + r.max) / 2, isSub: true });
  }
  return out;
}

/** Lignes comparées : d'abord l'ordre de la recette A, puis ce qui n'existe que dans B. */
export function compareRecipes(a: TreeNode, b: TreeNode): { rows: CompareRow[]; totalA: number; totalB: number } {
  const la = lines(a);
  const lb = lines(b);
  const sum = (ls: Line[], key: string) => {
    const hit = ls.filter((l) => l.key === key);
    return hit.length ? hit.reduce((s, l) => s + l.g, 0) : null;
  };
  const rows: CompareRow[] = [];
  const seen = new Set<string>();
  for (const l of [...la, ...lb]) {
    if (seen.has(l.key)) continue;
    seen.add(l.key);
    const other = lb.find((x) => x.key === l.key);
    rows.push({ key: l.key, name: l.name, a: sum(la, l.key), b: sum(lb, l.key), note: l.note ?? other?.note, isSub: l.isSub });
  }
  return { rows, totalA: treeBaseMass(a).avg, totalB: treeBaseMass(b).avg };
}

/** Étapes en lignes, chaque ligne marquée si elle n'existe pas (à l'identique) dans l'autre recette. */
export function compareSteps(a: string | null, b: string | null): { a: { text: string; changed: boolean }[]; b: { text: string; changed: boolean }[] } {
  const split = (s: string | null) =>
    htmlToPlainText(s ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const sa = split(a);
  const sb = split(b);
  const na = new Set(sa.map(norm));
  const nb = new Set(sb.map(norm));
  return {
    a: sa.map((text) => ({ text, changed: !nb.has(norm(text)) })),
    b: sb.map((text) => ({ text, changed: !na.has(norm(text)) })),
  };
}
