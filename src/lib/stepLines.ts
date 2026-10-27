/**
 * Découpe des étapes en texte brut (une étape par ligne) : lignes vides
 * retirées, numérotation tapée à la main enlevée (« 1. », « 2) », « - »),
 * et les lignes qui commencent par « # » deviennent des intertitres
 * (« # Crème »), non numérotés.
 */
export type StepLine = { kind: "step"; text: string; no: number } | { kind: "title"; text: string };

export function parseStepLines(content: string): StepLine[] {
  const out: StepLine[] = [];
  let no = 0;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const title = line.match(/^#+\s*(.+)$/);
    if (title) {
      out.push({ kind: "title", text: title[1].trim() });
      continue;
    }
    out.push({ kind: "step", text: line.replace(/^(\d+\s*[.)-]|[-•*])\s+/, ""), no: ++no });
  }
  return out;
}
