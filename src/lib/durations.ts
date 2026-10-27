/**
 * Durées écrites dans les étapes (« cuire 18 min », « repos 1 h 30 »,
 * « 45 s »), pour en faire des minuteurs en mode labo.
 * Une fourchette (« 10 à 12 min ») donne un minuteur sur le haut.
 */

export type DurationHit = {
  /** Position du texte trouvé dans l'étape. */
  start: number;
  end: number;
  seconds: number;
  /** Texte tel qu'écrit (« 1 h 30 »). */
  text: string;
};

const NUM = String.raw`\d+(?:[.,]\d+)?`;
// « 1 h 30 », « 1h30 », « 2 h », « 18 min », « 45 s » ; « 10 à 12 min » (fourchette).
const RE = new RegExp(
  String.raw`(?<![\w,.])(?:(${NUM})\s*(?:à|-|–)\s*)?(${NUM})\s*(h|heures?|min(?:utes?)?|mn|s|sec(?:ondes?)?)(?:\s*(\d{1,2})(?!\s*(?:°|%|g\b|min|s\b|cm|mm)))?(?![\wÀ-ÿ])`,
  "gi",
);

const toNum = (s: string) => Number(s.replace(",", "."));

export function findDurations(text: string): DurationHit[] {
  const out: DurationHit[] = [];
  for (const m of text.matchAll(RE)) {
    const value = toNum(m[2]);
    const unit = m[3].toLowerCase();
    let seconds = unit.startsWith("h") ? value * 3600 : unit.startsWith("m") ? value * 60 : value;
    // « 1 h 30 » : minutes après les heures.
    if (m[4] && unit.startsWith("h")) seconds += Number(m[4]) * 60;
    else if (m[4]) continue;
    if (!(seconds > 0) || seconds > 72 * 3600) continue;
    out.push({ start: m.index!, end: m.index! + m[0].length, seconds: Math.round(seconds), text: m[0] });
  }
  return out;
}

/** « 1:05:00 », « 18:00 », « 0:45 ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
