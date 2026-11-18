/**
 * Texte d'un PDF « numérique » (mercuriale ou facture envoyée par e-mail), page par page,
 * rangé en lignes comme sur la feuille. Sert au MCP : Claude lit les prix dans ce texte,
 * exact au centime, au lieu de les deviner sur une image. Un PDF scanné (sans texte)
 * rend des pages vides : il faut alors regarder le fichier.
 * pdf.js tourne ici sans « worker » séparé (côté serveur), seulement quand on le demande.
 */
export type PagePdf = { page: number; texte: string };

type ItemTexte = { str: string; transform: number[]; width: number; hasEOL?: boolean };

export async function texteDuPdf(bytes: Buffer | Uint8Array, maxPages = 60): Promise<{ pages: number; lues: PagePdf[] }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Le « worker » de pdf.js tourne dans le même fil : importé ici en clair pour qu'il soit
  // copié dans le site construit (sortie « standalone »), puis donné à pdf.js.
  const g = globalThis as { pdfjsWorker?: unknown };
  // @ts-expect-error : pdf.js ne publie pas de types pour son worker.
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    const lues: PagePdf[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const contenu = await page.getTextContent();
      lues.push({ page: n, texte: rangerEnLignes(contenu.items.filter((i) => "str" in i) as ItemTexte[]) });
      page.cleanup();
    }
    return { pages: doc.numPages, lues };
  } finally {
    await doc.destroy();
  }
}

/**
 * Regroupe les morceaux de texte par ligne (même hauteur sur la page), de gauche à droite.
 * Un grand écart entre deux morceaux (changement de colonne) devient « | ».
 */
export function rangerEnLignes(items: ItemTexte[]): string {
  const morceaux = items
    .filter((i) => i.str.trim() !== "")
    .map((i) => ({ x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || 8, fin: i.transform[4] + i.width, s: i.str.replace(/\s+/g, " ").trim() }));
  morceaux.sort((a, b) => b.y - a.y || a.x - b.x);
  const lignes: (typeof morceaux)[] = [];
  for (const m of morceaux) {
    const derniere = lignes[lignes.length - 1];
    if (derniere && Math.abs(derniere[0].y - m.y) <= Math.max(2, m.h * 0.4)) derniere.push(m);
    else lignes.push([m]);
  }
  return lignes
    .map((l) => {
      l.sort((a, b) => a.x - b.x);
      let t = "";
      let fin: number | null = null;
      for (const m of l) {
        if (fin == null) t = m.s;
        else t += m.x - fin > m.h * 1.5 ? ` | ${m.s}` : ` ${m.s}`;
        fin = m.fin;
      }
      return t;
    })
    .join("\n");
}
