import { describe, it, expect } from "vitest";
import { renderRecipeCard, type RecipeSnap } from "@/lib/pdf/template";
import { DEFAULT_THEME } from "@/lib/pdf/theme";

/**
 * Régression : la ligne « Total · X » d'une fiche recette dans le PDF doit
 * TOUJOURS être égale à la somme des ingrédients réellement affichés.
 *
 * Bug d'origine : une recette figée (snapshot) dans un cahier dont la masse
 * avait été modifiée après coup conservait un totalMassGMin/Max périmé, si
 * bien que le PDF affichait l'ancienne masse (ex. confit 940 g alors que les
 * ingrédients additionnés faisaient 1305 g).
 */
function extractTotalG(html: string): number | null {
  const m = html.match(/Total · ([^<]+)</);
  if (!m) return null;
  const raw = m[1].trim();
  // « 1,31 kg » ou « 1305 g » → grammes
  const isKg = /kg/i.test(raw);
  const num = parseFloat(raw.replace(/[^0-9,.-]/g, "").replace(",", "."));
  return isKg ? Math.round(num * 1000) : Math.round(num);
}

const theme = { ...DEFAULT_THEME, showTotalMass: true };

describe("renderRecipeCard — total = somme des ingrédients affichés", () => {
  it("ignore un totalMassGMin/Max périmé (masse augmentée)", () => {
    const staleSnap: RecipeSnap = {
      name: "Confit griottes",
      ingredients: [
        { name: "Purée de griotte", quantityG: 1040, unit: "g" },
        { name: "Pectine NH", quantityG: 17, unit: "g" },
        { name: "Sucre semoule", quantityG: 118, unit: "g" },
        { name: "Glucose atomisé", quantityG: 118, unit: "g" },
        { name: "Jus de citron jaune", quantityG: 12, unit: "g" },
      ],
      steps: null,
      totalMassG: 940,
      totalMassGMin: 940,
      totalMassGMax: 940,
      subRecipes: [],
    };
    const html = renderRecipeCard(staleSnap, "single", null, "", theme);
    // Affiché « 1,31 kg » (formatG arrondit à 2 décimales en kg) : on tolère
    // l'arrondi d'affichage, mais ce doit être ~1305 g et surtout PAS 940 g.
    const total = extractTotalG(html);
    expect(total).not.toBeNull();
    expect(Math.abs((total as number) - 1305)).toBeLessThanOrEqual(10);
    expect(total).not.toBe(940);
  });

  it("ignore un totalMassGMin/Max périmé (masse réduite)", () => {
    const staleSnap: RecipeSnap = {
      name: "Pâte sucrée",
      ingredients: [
        { name: "Beurre", quantityG: 140, unit: "g" },
        { name: "Sucre glace", quantityG: 175, unit: "g" },
        { name: "Farine", quantityG: 348, unit: "g" },
        { name: "Oeufs", quantityG: 140, unit: "g" },
        { name: "Vanille", quantityG: 0, unit: "g" },
      ],
      steps: null,
      totalMassG: 2100,
      totalMassGMin: 2100,
      totalMassGMax: 2100,
      subRecipes: [],
    };
    const html = renderRecipeCard(staleSnap, "single", null, "", theme);
    expect(extractTotalG(html)).toBe(803);
  });

  it("gère les unités volumiques (L → g) dans le total", () => {
    const snap: RecipeSnap = {
      name: "Sirop",
      ingredients: [
        { name: "Eau", quantityG: 1, unit: "L" }, // 1000 g
        { name: "Sucre", quantityG: 500, unit: "g" },
      ],
      steps: null,
      totalMassG: 0,
      subRecipes: [],
    };
    const html = renderRecipeCard(snap, "single", null, "", theme);
    expect(extractTotalG(html)).toBe(1500);
  });
});
