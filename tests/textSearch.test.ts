import { describe, expect, it } from "vitest";
import { foldChars, ingredientTerms, recipesWithIngredients, searchableText, snippet } from "@/lib/textSearch";

describe("recherche dans le texte", () => {
  it("garde la longueur pour que les positions restent justes", () => {
    expect(foldChars("Crème brûlée")).toBe("creme brulee");
  });

  it("extrait autour du mot, sans accents ni majuscules", () => {
    const s = snippet("Porter le lait à ébullition puis baisser le four à 160 °C pour la crème.", "creme", 30);
    expect(s?.match).toBe("crème");
    expect(s?.before.startsWith("…")).toBe(true);
    expect(snippet("rien à voir", "chocolat")).toBeNull();
  });

  it("nettoie les étapes", () => {
    expect(searchableText("# Montage\nverser {167 g} de lait")).toBe("Montage\nverser 167 g de lait");
  });

  it("plusieurs ingrédients avec +", () => {
    expect(ingredientTerms("jaunes + crème")).toEqual(["jaunes", "crème"]);
  });

  it("trouve les recettes par ingrédient, sous-recettes comprises", () => {
    const uses = [
      { recipeId: 1, name: "Jaune oeufs", quantityG: 160, unit: "g" },
      { recipeId: 1, name: "Lait", quantityG: 1000, unit: "g" },
      { recipeId: 2, name: "Crème 35%", quantityG: 300, unit: "g" },
      { recipeId: 3, name: "Fondant", quantityG: 400, unit: "g" },
    ];
    const links = [{ parentId: 3, childId: 1, label: "Crème pâtissière" }];
    const one = recipesWithIngredients(["jaune"], uses, links);
    expect([...one.keys()].sort()).toEqual([1, 3]);
    expect(one.get(3)?.[0]).toMatchObject({ name: "Jaune oeufs", via: "Crème pâtissière" });
    // Les deux à la fois : seulement l'éclair (fondant + jaunes via la crème).
    expect([...recipesWithIngredients(["jaune", "fondant"], uses, links).keys()]).toEqual([3]);
  });
});
