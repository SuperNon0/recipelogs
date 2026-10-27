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
  /** Ce qui s'affiche à la place des grammes quand l'ingrédient ne se pèse pas
   * (QS, pièces sans poids), de chaque côté. */
  noteA?: string;
  noteB?: string;
  /** Vrai si la ligne diffère (grammes, nombre de pièces ou QS). */
  changed: boolean;
  isSub?: boolean;
};

const norm = (s: string) => s.replace(/œ/gi, "oe").replace(/æ/gi, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

type Line = { key: string; name: string; g: number; qs?: boolean; pieces?: number; isSub?: boolean };

function lines(node: TreeNode): Line[] {
  const out: Line[] = [];
  for (const i of node.ingredients) {
    if (i.unit === "titre") continue;
    // Une fourchette compte pour sa moyenne, comme la masse totale.
    const q = (i.quantityG + (i.quantityGMax ?? i.quantityG)) / 2;
    const g = ingMass(q, i.unit, i.pieceG);
    const loose = i.unit === "pièce" && !(i.pieceG && i.pieceG > 0);
    out.push({ key: `i:${norm(i.name)}`, name: i.name, g, qs: i.unit === "QS" || undefined, pieces: loose ? q : undefined });
  }
  const memo = new Map();
  for (const l of node.subLinks) {
    const r = resolveLink(l, 1, memo);
    out.push({ key: `s:${l.childId}`, name: l.label, g: (r.min + r.max) / 2, isSub: true });
  }
  return out;
}

const fmtCount = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} pièce${n > 1 ? "s" : ""}`;

/** Grammes, pièces sans poids et QS d'un ingrédient dans une recette (null = absent). */
function side(ls: Line[], key: string): { g: number; pieces: number; note?: string } | null {
  const hit = ls.filter((l) => l.key === key);
  if (!hit.length) return null;
  const g = hit.reduce((s, l) => s + l.g, 0);
  const pieces = hit.reduce((s, l) => s + (l.pieces ?? 0), 0);
  const qs = hit.some((l) => l.qs);
  const parts = [...(pieces > 0 ? [fmtCount(pieces)] : []), ...(qs && g === 0 && pieces === 0 ? ["QS"] : [])];
  // Sans aucun gramme, on montre les pièces ou « QS » à la place.
  return { g, pieces, note: parts.length && g === 0 ? parts.join(" + ") : undefined };
}

/** Lignes comparées : d'abord l'ordre de la recette A, puis ce qui n'existe que dans B. */
export function compareRecipes(a: TreeNode, b: TreeNode): { rows: CompareRow[]; totalA: number; totalB: number } {
  const la = lines(a);
  const lb = lines(b);
  const rows: CompareRow[] = [];
  const seen = new Set<string>();
  for (const l of [...la, ...lb]) {
    if (seen.has(l.key)) continue;
    seen.add(l.key);
    const sa = side(la, l.key);
    const sb = side(lb, l.key);
    const changed =
      !sa || !sb || Math.abs(sb.g - sa.g) > 0.001 || Math.abs(sb.pieces - sa.pieces) > 0.001 || sa.note !== sb.note;
    rows.push({ key: l.key, name: l.name, a: sa?.g ?? null, b: sb?.g ?? null, noteA: sa?.note, noteB: sb?.note, changed, isSub: l.isSub });
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
