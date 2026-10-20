import { buildRecipeSnapshot, type RecipeSnapshot, getCookbookDetail } from "@/lib/cookbooks";
import { buildCoverTocHtml, buildRecipesHtml, TOC_ANCHOR_PREFIX, type CookbookEntryUnion } from "./template";
import { renderHtmlToPdf, mergePdfs, readAnchorPages } from "./renderer";
import type { CookbookTheme } from "./theme";
import { photoDataUri } from "@/lib/uploads";

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

  const entries: CookbookEntryUnion[] = [];
  for (const r of raw) {
    if (r.kind === "chapter") {
      entries.push({ type: "chapter", title: r.data.title, intro: r.data.intro ?? "" });
      continue;
    }
    const entry = r.data;
    const snap =
      entry.linkMode === "snapshot" && entry.snapshotData
        ? (entry.snapshotData as unknown as NonNullable<RecipeSnapshot>)
        : await buildRecipeSnapshot(entry.recipeId);
    if (!snap) continue;
    // Les sous-recettes sont toujours rendues sur leur propre page :
    // `buildRecipesHtml` les dérive de `snap.subRecipes` (subrecipeMode ignoré).
    entries.push({ type: "recipe", snap, subrecipeMode: "single", sectionTitle: entry.sectionTitle ?? null });
  }
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
  const { format, theme } = opts;
  const entries = theme.recipeLayout === "magazine" ? await withInlinePhotos(opts.entries) : opts.entries;

  // Les recettes sont rendues EN PREMIER : on relit dans ce PDF la page réelle
  // de chaque entrée pour que le sommaire soit exact.
  let recipesPdf: Uint8Array | null = null;
  let tocPages: number[] | undefined;
  if (entries.length > 0) {
    const html = buildRecipesHtml({ format, theme, entries, hasFooter: true });
    recipesPdf = await renderHtmlToPdf(html, format, {
      footer: opts.footer,
      footerAlign: theme.footerAlign,
      showPageNumber: true,
    });
    if (opts.hasToc) tocPages = await readAnchorPages(recipesPdf, TOC_ANCHOR_PREFIX);
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
    pdfs.push(await renderHtmlToPdf(html, format, {}));
  }
  if (recipesPdf) pdfs.push(recipesPdf);

  return pdfs.length > 0 ? mergePdfs(pdfs) : null;
}

/** Mise en page magazine : intègre les photos des recettes dans le HTML. */
async function withInlinePhotos(entries: CookbookEntryUnion[]): Promise<CookbookEntryUnion[]> {
  return Promise.all(
    entries.map(async (e) =>
      e.type === "recipe" ? { ...e, snap: { ...e.snap, photoPath: await photoDataUri(e.snap.photoPath) } } : e,
    ),
  );
}
