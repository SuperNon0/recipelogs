import { describe, expect, it } from "vitest";
import { DEMO_INGREDIENTS, DEMO_INVOICES, DEMO_RECIPES, DEMO_COOKBOOKS, DEMO_PRODUCTION, DEMO_SHOPPING_LISTS } from "@/lib/demoExamples/data";

const keys = DEMO_RECIPES.map((r) => r.key);
const ingredientNames = new Set(DEMO_INGREDIENTS.map((i) => i.name));

describe("données d'exemple de la démo", () => {
  it("chaque recette a une clé unique et chaque sous-recette ou variante est écrite avant", () => {
    expect(new Set(keys).size).toBe(keys.length);
    DEMO_RECIPES.forEach((r, i) => {
      for (const s of r.subs ?? []) expect(keys.slice(0, i)).toContain(s.recipe);
      if (r.variantOf) expect(keys.slice(0, i)).toContain(r.variantOf.key);
    });
  });

  it("les ingrédients des recettes et des factures ont tous leur fiche", () => {
    for (const r of DEMO_RECIPES) for (const [name, , unit] of r.ingredients) if (unit !== "titre") expect(ingredientNames).toContain(name);
    for (const inv of DEMO_INVOICES) for (const l of inv.lines) if (l.ingredient) expect(ingredientNames).toContain(l.ingredient);
  });

  it("cahiers, listes et production pointent vers des recettes existantes", () => {
    const refs = [
      ...DEMO_COOKBOOKS.flatMap((c) => c.entries.flatMap((e) => ("recipe" in e ? [e.recipe] : []))),
      ...DEMO_SHOPPING_LISTS.flatMap((l) => l.recipes.map((r) => r.recipe)),
      ...DEMO_PRODUCTION.map((p) => p.recipe),
    ];
    for (const k of refs) expect(keys).toContain(k);
  });

  it("toutes les recettes vendues ont un prix de vente", () => {
    for (const r of DEMO_RECIPES.filter((x) => x.categories.includes("Vitrine boutique"))) expect(r.sale?.price).toBeGreaterThan(0);
  });
});
