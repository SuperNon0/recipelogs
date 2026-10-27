/**
 * Moules et cadres : surface, volume et coefficient pour passer d'un moule à un
 * autre (mode « Moule » du multiplicateur). Dimensions en centimètres.
 * Pur (aucun accès base) : utilisé par la fiche, le formulaire et le serveur.
 */

export type MoldShape = "cercle" | "cadre" | "carre";

/** Un moule : cercle (a = diamètre), cadre (a × b) ou carré (a de côté), hauteur facultative. */
export type Mold = { shape: MoldShape; a: number; b?: number | null; h?: number | null };

/** Moules courants proposés dans les listes (sans hauteur). */
export const MOLD_PRESETS: Mold[] = [
  { shape: "cercle", a: 8 },
  { shape: "cercle", a: 10 },
  { shape: "cercle", a: 14 },
  { shape: "cercle", a: 16 },
  { shape: "cercle", a: 18 },
  { shape: "cercle", a: 20 },
  { shape: "cercle", a: 22 },
  { shape: "cercle", a: 24 },
  { shape: "cercle", a: 26 },
  { shape: "cercle", a: 28 },
  { shape: "carre", a: 16 },
  { shape: "carre", a: 18 },
  { shape: "carre", a: 20 },
  { shape: "carre", a: 24 },
  { shape: "cadre", a: 30, b: 40 },
  { shape: "cadre", a: 40, b: 60 },
  { shape: "cadre", a: 57, b: 37 },
];

export const MOLD_SHAPE_LABEL: Record<MoldShape, string> = { cercle: "Cercle", cadre: "Cadre", carre: "Carré" };

const n = (x: number) => x.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** « Cercle Ø18 », « Cadre 40×60 », « Carré 20 » (+ « · h 4,5 cm »). */
export function moldLabel(m: Mold, withHeight = true): string {
  const base =
    m.shape === "cercle" ? `Cercle Ø${n(m.a)}` : m.shape === "carre" ? `Carré ${n(m.a)}` : `Cadre ${n(m.a)}×${n(m.b ?? m.a)}`;
  return withHeight && m.h ? `${base} · h ${n(m.h)} cm` : base;
}

/** Clé stable d'un moule sans sa hauteur (pour retrouver un modèle dans une liste). */
export function moldKey(m: Mold): string {
  return m.shape === "cadre" ? `cadre:${m.a}x${m.b ?? m.a}` : `${m.shape}:${m.a}`;
}

/** Surface en cm². */
export function moldArea(m: Mold): number {
  if (m.shape === "cercle") return Math.PI * (m.a / 2) ** 2;
  if (m.shape === "carre") return m.a * m.a;
  return m.a * (m.b ?? m.a);
}

/**
 * Coefficient pour passer du moule `from` à `count` moules `to`.
 * Rapport des volumes si les deux hauteurs sont connues, sinon des surfaces
 * (même hauteur de remplissage).
 */
export function moldCoef(from: Mold, to: Mold, count = 1): number {
  const af = moldArea(from);
  const at = moldArea(to);
  if (!(af > 0) || !(at > 0) || !(count > 0)) return 1;
  const heights = from.h && to.h && from.h > 0 && to.h > 0 ? to.h / from.h : 1;
  return (at / af) * heights * count;
}

/** Nombre de moules `to` que remplit la recette faite pour `from` (à ×1). */
export function moldsFilled(from: Mold, to: Mold): number {
  const c = moldCoef(from, to, 1);
  return c > 0 ? 1 / c : 0;
}

/** Lit un moule venu de la base ou d'un formulaire ; null s'il est incomplet. */
export function parseMold(raw: unknown): Mold | null {
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      return parseMold(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shape = o.shape;
  if (shape !== "cercle" && shape !== "cadre" && shape !== "carre") return null;
  const num = (v: unknown) => {
    const x = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
    return Number.isFinite(x) && x > 0 && x <= 1000 ? Math.round(x * 10) / 10 : null;
  };
  const a = num(o.a);
  if (!a) return null;
  const b = shape === "cadre" ? num(o.b) : null;
  if (shape === "cadre" && !b) return null;
  const h = num(o.h);
  return { shape, a, ...(b ? { b } : {}), ...(h ? { h } : {}) };
}
