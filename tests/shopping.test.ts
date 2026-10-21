import { describe, it, expect } from "vitest";
import { aggregateIngredients } from "@/lib/shopping";

type Ing = { name: string; quantityG: number; quantityGMax?: number | null; unit?: string };
const src = (recipeId: number, ingredients: Ing[]) => ({ recipeId, ingredients });

describe("aggregateIngredients", () => {
  it("retourne vide si aucune recette", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });

  it("retourne les ingrédients d'une seule recette", () => {
    const result = aggregateIngredients([
      src(1, [
        { name: "Farine", quantityG: 200 },
        { name: "Beurre", quantityG: 100 },
      ]),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.name === "Farine")?.quantityG).toBe(200);
    expect(result.find((i) => i.name === "Beurre")?.quantityG).toBe(100);
  });

  it("fusionne les ingrédients identiques (insensible à la casse)", () => {
    const result = aggregateIngredients([
      src(1, [{ name: "Farine", quantityG: 200 }]),
      src(2, [{ name: "farine", quantityG: 300 }]),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].quantityG).toBe(500);
    expect(result[0].name).toBe("Farine");
  });

  it("ne fusionne pas des unités différentes", () => {
    const result = aggregateIngredients([
      src(1, [{ name: "Œufs", quantityG: 2, unit: "pièce" }]),
      src(2, [{ name: "Œufs", quantityG: 100, unit: "g" }]),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((i) => i.unit === "pièce")?.quantityG).toBe(2);
    expect(result.find((i) => i.unit === "g")?.quantityG).toBe(100);
  });

  it("additionne les cuillères entre elles", () => {
    const result = aggregateIngredients([
      src(1, [{ name: "Vanille", quantityG: 1, unit: "cc" }]),
      src(2, [{ name: "vanille", quantityG: 2, unit: "cc" }]),
    ]);
    expect(result).toEqual([{ name: "Vanille", quantityG: 3, unit: "cc", recipeId: 1 }]);
  });

  it("prend le max d'une fourchette", () => {
    const result = aggregateIngredients([
      src(1, [{ name: "Sucre", quantityG: 100, quantityGMax: 150 }]),
    ]);
    expect(result[0].quantityG).toBe(150);
  });

  it("garde une seule ligne QS sans quantité", () => {
    const result = aggregateIngredients([
      src(1, [{ name: "Sel", quantityG: 0, unit: "QS" }]),
      src(2, [{ name: "sel", quantityG: 0, unit: "QS" }]),
    ]);
    expect(result).toEqual([{ name: "Sel", quantityG: null, unit: "QS", recipeId: 1 }]);
  });

  it("conserve le recipeId de la première occurrence", () => {
    const result = aggregateIngredients([
      src(5, [{ name: "Beurre", quantityG: 100 }]),
      src(9, [{ name: "Beurre", quantityG: 50 }]),
    ]);
    expect(result[0].recipeId).toBe(5);
  });
});

describe("aggregateIngredients — titres de section", () => {
  it("ignore les lignes à 0 g (rien à acheter)", () => {
    const out = aggregateIngredients([
      { recipeId: 1, ingredients: [
        { name: "Levain", quantityG: 0, unit: "g" },
        { name: "Levure", quantityG: 19, unit: "g" },
      ] },
    ]);
    expect(out.map((i) => i.name)).toEqual(["Levure"]);
  });
});
