import { describe, it, expect } from "vitest";
import { aggregateIngredients } from "@/lib/shopping";

const makeRecipe = (id: number, name: string, ingredients: { name: string; quantityG: number }[]) => ({
  coefficient: 1,
  recipe: {
    id,
    name,
    ingredients: ingredients.map((i) => ({
      name: i.name,
      quantityG: i.quantityG,
      ingredientBase: null,
    })),
  },
});

describe("aggregateIngredients", () => {
  it("retourne vide si aucune recette", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it("retourne les ingrédients d'une seule recette", () => {
    const result = aggregateIngredients([
      makeRecipe(1, "Recette A", [
        { name: "Farine", quantityG: 200 },
        { name: "Beurre", quantityG: 100 },
      ]),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.name === "Farine")?.quantityG).toBe(200);
    expect(result.find((i) => i.name === "Beurre")?.quantityG).toBe(100);
  });

  it("fusionne les ingrédients identiques (case-insensitive)", () => {
    const result = aggregateIngredients([
      makeRecipe(1, "Recette A", [{ name: "Farine", quantityG: 200 }]),
      makeRecipe(2, "Recette B", [{ name: "farine", quantityG: 300 }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantityG).toBe(500);
  });

  it("applique le coefficient correctement", () => {
    const result = aggregateIngredients([
      {
        coefficient: 2,
        recipe: {
          id: 1,
          name: "Recette A",
          ingredients: [{ name: "Sucre", quantityG: 150, ingredientBase: null }],
        },
      },
    ]);
    expect(result[0].quantityG).toBe(300);
  });

  it("applique le coefficient avant la fusion", () => {
    const result = aggregateIngredients([
      {
        coefficient: 3,
        recipe: {
          id: 1,
          name: "Recette A",
          ingredients: [{ name: "Oeufs", quantityG: 100, ingredientBase: null }],
        },
      },
      {
        coefficient: 0.5,
        recipe: {
          id: 2,
          name: "Recette B",
          ingredients: [{ name: "oeufs", quantityG: 200, ingredientBase: null }],
        },
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantityG).toBe(400); // 100×3 + 200×0.5
  });

  it("conserve les ingrédients distincts séparément", () => {
    const result = aggregateIngredients([
      makeRecipe(1, "R1", [
        { name: "Farine", quantityG: 100 },
        { name: "Sel", quantityG: 5 },
      ]),
      makeRecipe(2, "R2", [
        { name: "Farine", quantityG: 200 },
        { name: "Beurre", quantityG: 80 },
      ]),
    ]);
    expect(result).toHaveLength(3);
    expect(result.find((i) => i.name === "Farine")?.quantityG).toBe(300);
    expect(result.find((i) => i.name === "Sel")?.quantityG).toBe(5);
    expect(result.find((i) => i.name === "Beurre")?.quantityG).toBe(80);
  });

  it("utilise ingredientBase.name si name est null", () => {
    const result = aggregateIngredients([
      {
        coefficient: 1,
        recipe: {
          id: 1,
          name: "R",
          ingredients: [
            { name: null, quantityG: 50, ingredientBase: { name: "Vanille" } },
          ],
        },
      },
    ]);
    expect(result[0].name).toBe("Vanille");
    expect(result[0].quantityG).toBe(50);
  });
});
