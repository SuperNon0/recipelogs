import { roundScaled } from "./massAdjust";

/**
 * Quantités liées dans les étapes : « verser {167 g} de lait » s'affiche
 * « verser 167 g de lait » et suit le multiplicateur (×2 → 334 g), comme les
 * ingrédients. Écriture : un nombre et une unité facultative entre accolades.
 */
const TOKEN = /\{\s*(\d+(?:[.,]\d+)?)\s*(kg|mg|g|cl|ml|L|l|cc|cs|pièces?|pcs?)?\s*\}/g;

export type StepPart = string | { qty: string };

/** Texte d'une quantité liée mise à l'échelle (« 334 g »). */
function scaledText(value: number, unit: string | undefined, coef: number, wholeNumbers: boolean): string {
  const u = unit === "l" ? "L" : unit;
  const piece = !!u && (u.startsWith("pi") || u.startsWith("pc"));
  let v = value * coef;
  if (coef !== 1 || wholeNumbers) {
    // kg et L gardent 2 décimales (1,25 kg) ; le reste, comme les ingrédients.
    v = u === "kg" || u === "L" ? Math.round(v * 100) / 100 : roundScaled(v, piece ? "pièce" : "g");
  }
  const n = v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  if (!u) return n;
  return piece ? `${n} ${v > 1 ? "pièces" : "pièce"}` : `${n} ${u}`;
}

/** Découpe une étape en texte et quantités liées, mises à l'échelle par `coef`. */
export function scaleStepParts(text: string, coef = 1, wholeNumbers = false): StepPart[] {
  const out: StepPart[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ qty: scaledText(Number(m[1].replace(",", ".")), m[2], coef, wholeNumbers) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Vrai si le texte contient au moins une quantité liée. */
export function hasStepQty(text: string | null | undefined): boolean {
  return !!text && new RegExp(TOKEN.source).test(text);
}
