import { buildRecipeSnapshot, type RecipeSnapshot, getCookbookDetail } from "@/lib/cookbooks";
import { buildCoverTocHtml, buildRecipesHtml, type CookbookEntryUnion } from "./template";
import { renderHtmlToPdf, mergePdfs } from "./renderer";
import type { CookbookTheme } from "./theme";

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
 *  1. couverture + sommaire, sans pied de page ;
 *  2. recettes, avec pied de page et numéro (la 1ʳᵉ recette = page 1).
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
    });
    pdfs.push(await renderHtmlToPdf(html, format, {}));
  }

  if (entries.length > 0) {
    const html = buildRecipesHtml({ format, theme, entries, hasFooter: true });
    pdfs.push(
      await renderHtmlToPdf(html, format, {
        footer: opts.footer,
        footerAlign: theme.footerAlign,
        showPageNumber: true,
      }),
    );
  }

  return pdfs.length > 0 ? mergePdfs(pdfs) : null;
}
