import { buildRecipeSnapshot, type RecipeSnapshot, getCookbookDetail } from "@/lib/cookbooks";
import { buildCoverTocHtml, buildRecipesHtml, TOC_ANCHOR_PREFIX, type CookbookEntryUnion } from "./template";
import { renderHtmlToPdf, mergePdfs, readAnchorPages } from "./renderer";
import { decoratePdf } from "./decorate";
import { recipePageMargins, themeHeaderText, type CookbookTheme } from "./theme";

type CookbookDetail = NonNullable<Awaited<ReturnType<typeof getCookbookDetail>>>;

/**
 * Entrées du cahier (recettes + chapitres) dans l'ordre d'affichage.
 * Recette figée 📌 → son snapshot ; recette liée 🔗 → recalculée maintenant.
 */
export async function loadCookbookEntries(cookbook: CookbookDetail): Promise<CookbookEntryUnion[]> {
  const raw = [
    ...cookbook.entries.map((e) => ({ kind: "recipe" as const, data: e })),
    ...cookbook.chapters.map((c) => ({ kind: "chapter" as const, data: c })),
  ].sort((a, b) => a.data.position - b.data.position);

  // Snapshots des recettes liées calculés en parallèle (par lots de 4 pour
  // ne pas épuiser les connexions à la base), dans l'ordre du cahier.
  const snaps: (NonNullable<RecipeSnapshot> | null)[] = [];
  for (let i = 0; i < raw.length; i += 4) {
    snaps.push(
      ...(await Promise.all(
        raw.slice(i, i + 4).map(async (r) => {
          if (r.kind === "chapter") return null;
          const entry = r.data;
          return entry.linkMode === "snapshot" && entry.snapshotData
            ? (entry.snapshotData as unknown as NonNullable<RecipeSnapshot>)
            : buildRecipeSnapshot(entry.recipeId);
        }),
      )),
    );
  }

  const entries: CookbookEntryUnion[] = [];
  raw.forEach((r, i) => {
    if (r.kind === "chapter") {
      entries.push({ type: "chapter", title: r.data.title, intro: r.data.intro ?? "" });
      return;
    }
    const snap = snaps[i];
    if (!snap) return;
    // Les sous-recettes sont toujours rendues sur leur propre page :
    // `buildRecipesHtml` les dérive de `snap.subRecipes` (subrecipeMode ignoré).
    entries.push({ type: "recipe", snap, subrecipeMode: "single", sectionTitle: r.data.sectionTitle ?? null });
  });
  return entries;
}

/**
 * PDF complet d'un cahier en 2 passes fusionnées :
 *  1. recettes, avec pied de page et numéro (la 1ʳᵉ recette = page 1) ;
 *  2. couverture + sommaire (numéros relus dans la passe 1), sans pied de page.
 * Renvoie null si le cahier ne produirait aucune page.
 */
export async function renderCookbookPdf(opts: {
  name: string;
  description: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  theme: CookbookTheme;
  footer: string | null;
  entries: CookbookEntryUnion[];
}): Promise<Uint8Array | null> {
  const { format, theme, entries } = opts;

  // Les recettes sont rendues EN PREMIER : on relit dans ce PDF la page réelle
  // de chaque entrée pour que le sommaire soit exact.
  let recipesPdf: Uint8Array | null = null;
  let tocPages: number[] | undefined;
  if (entries.length > 0) {
    const header = themeHeaderText(theme, opts.name);
    // Texte du cahier s'il en a un, sinon celui du thème.
    const footer = opts.footer?.trim() || theme.footerText.trim();
    const hasFooter = !!footer || theme.showPageNumbers;
    const html = buildRecipesHtml({ format, theme, entries, hasFooter, hasHeader: !!header });
    recipesPdf = await renderHtmlToPdf(html, format, {
      footer,
      footerAlign: theme.footerAlign,
      showPageNumber: theme.showPageNumbers,
      pageNumberAlign: theme.pageNumberAlign,
      header,
      headerAlign: theme.headerAlign,
      sideMarginMm: recipePageMargins(theme, { header: false, footer: false }).left,
    });
    if (opts.hasToc) tocPages = await readAnchorPages(recipesPdf, TOC_ANCHOR_PREFIX);
    recipesPdf = await decoratePdf(recipesPdf, theme);
  }

  const pdfs: Uint8Array[] = [];
  if (opts.hasCover || opts.hasToc) {
    const html = buildCoverTocHtml({
      cookbookName: opts.name,
      description: opts.description,
      hasCover: opts.hasCover,
      hasToc: opts.hasToc,
      format,
      theme,
      entries,
      tocPages,
    });
    // Papier / cadre aussi sur le sommaire, mais pas sur la couverture.
    pdfs.push(await decoratePdf(await renderHtmlToPdf(html, format, {}), theme, { skipFirstPage: opts.hasCover }));
  }
  if (recipesPdf) pdfs.push(recipesPdf);

  return pdfs.length > 0 ? mergePdfs(pdfs) : null;
}
