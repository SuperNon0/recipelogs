import { buildRecipeSnapshot } from "@/lib/cookbooks";
import { prisma } from "@/lib/prisma";
import { photoDataUri } from "@/lib/uploads";
import { buildSingleRecipeHtml, type RecipeSnap } from "./template";
import { renderHtmlToPdf } from "./renderer";
import { decoratePdf } from "./decorate";
import { themeShowsPhoto, type CookbookTheme } from "./theme";

/** PDF d'une recette seule (et de ses sous-recettes) avec un thème donné. */
export async function renderRecipePdf(
  snap: RecipeSnap,
  theme: CookbookTheme,
  format: "A4" | "A5",
): Promise<Uint8Array> {
  const photo = themeShowsPhoto(theme) ? await photoDataUri(snap.photoPath) : null;
  const html = buildSingleRecipeHtml({ ...snap, photoPath: photo }, format, theme);
  // Numéros de page seulement quand la recette tient sur plusieurs pages (sous-recettes).
  const showPageNumber = theme.showPageNumbers && snap.subRecipes.length > 0;
  return decoratePdf(await renderHtmlToPdf(html, format, { showPageNumber }), theme);
}

/** Recette d'exemple quand la base ne contient encore aucune recette. */
export const SAMPLE_SNAP: RecipeSnap = {
  name: "Tarte au citron meringuée",
  source: "Exemple",
  notesTips: "Laisser reposer la pâte 1 h au froid avant de la foncer.",
  rating: 4,
  photoPath: null,
  tags: ["agrumes", "été"],
  categories: ["Tartes"],
  ingredients: [
    { name: "Farine T55", quantityG: 250 },
    { name: "Beurre doux", quantityG: 125 },
    { name: "Sucre glace", quantityG: 90 },
    { name: "Œufs", quantityG: 50 },
    { name: "Jus de citron", quantityG: 120 },
    { name: "Zeste de citron", quantityG: 1, unit: "pièce" },
    { name: "Sel fin", quantityG: 0, unit: "QS" },
  ],
  steps:
    "<p>Sabler la farine avec le beurre froid et le sucre glace.</p><p>Ajouter l'œuf, fraser rapidement et filmer.</p><p>Foncer un cercle de 22 cm, cuire à blanc 20 min à 165 °C.</p><p>Garnir de crème citron et pocher la meringue.</p>",
  totalMassG: 635,
  subRecipes: [],
};

/**
 * Recette utilisée pour l'aperçu d'un thème : celle demandée, sinon la plus
 * récente qui a des ingrédients et des étapes, sinon l'exemple.
 */
export async function previewSnap(recipeId?: number | null): Promise<RecipeSnap> {
  if (recipeId) {
    const s = await buildRecipeSnapshot(recipeId);
    if (s) return s;
  }
  const r = await prisma.recipe.findFirst({
    where: { ingredients: { some: {} }, stepsBlock: { isNot: null } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (r) {
    const s = await buildRecipeSnapshot(r.id);
    if (s) return s;
  }
  return SAMPLE_SNAP;
}
