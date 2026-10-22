export type MergedPr = {
  number: number;
  date: string;
  title: string;
};

/**
 * Lit les PR fusionnées depuis l'historique git (merge commits « Merge pull
 * request #N … » et squash « Titre (#N) »). Appelé par next.config.ts au
 * moment du build : le résultat est figé dans le site, sans appel à GitHub.
 */
export function parseGitLog(raw: string, limit = 30): MergedPr[] {
  const prs: MergedPr[] = [];
  for (const record of raw.split("\x1e")) {
    const [date, subject, body = ""] = record.trim().split("\x1f");
    if (!date || !subject) continue;
    let number: number | undefined;
    let title = "";
    const merge = subject.match(/^Merge pull request #(\d+)/);
    const squash = subject.match(/^(.*) \(#(\d+)\)$/);
    if (merge) {
      number = Number(merge[1]);
      title = body.trim().split("\n")[0] ?? "";
    } else if (squash) {
      number = Number(squash[2]);
      title = squash[1];
    }
    if (!number) continue;
    prs.push({ number, date, title: cleanTitle(title) || `PR #${number}` });
    if (prs.length >= limit) break;
  }
  return prs;
}

/** « fix(themes) : le badge… » → « Le badge… » */
export function cleanTitle(title: string): string {
  const t = title.replace(/^[a-z]+(\([^)]*\))?\s*!?\s*:\s*/i, "").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** PR fusionnées figées au build (vide en dev sans git). */
export function getMergedPrs(): MergedPr[] {
  try {
    return JSON.parse(process.env.NEXT_PUBLIC_MERGED_PRS || "[]") as MergedPr[];
  } catch {
    return [];
  }
}
