import { describe, it, expect } from "vitest";
import { planIngredientRepair } from "@/lib/ingredientRepair";
import { isQuantityOnly, parseIngredientsText } from "@/lib/parseIngredientsText";

const ing = (id: number, name: string, quantityG: number, unit = "g", quantityGMax: number | null = null) => ({
  id, name, quantityG, unit, quantityGMax,
});

describe("isQuantityOnly", () => {
  it("reconnaît une quantité sans nom", () => {
    for (const t of ["800g", "- 200 g", "1,5 kg", "100-200g", "250 ml", "· 3 cs"]) expect(isQuantityOnly(t)).toBe(true);
  });
  it("refuse un vrai ingrédient", () => {
    for (const t of ["Farine", "200g farine", "Œufs 3", "Fond sucrée"]) expect(isQuantityOnly(t)).toBe(false);
  });
});

describe("planIngredientRepair", () => {
  it("recolle la quantité à l'ingrédient précédent sans quantité", () => {
    const plan = planIngredientRepair([
      ing(1, "Abricots frais", 0), ing(2, "800g", 800),
      ing(3, "Crémeux vanille", 0), ing(4, "400g", 400),
    ]);
    expect(plan.updates).toEqual([
      { id: 1, quantityG: 800, quantityGMax: null, unit: "g" },
      { id: 3, quantityG: 400, quantityGMax: null, unit: "g" },
    ]);
    expect(plan.deletes).toEqual([2, 4]);
  });
  it("ne touche pas un ingrédient qui a déjà une quantité", () => {
    const plan = planIngredientRepair([ing(1, "Farine", 250), ing(2, "50g", 50)]);
    expect(plan).toEqual({ updates: [], deletes: [] });
  });
  it("laisse les titres de section (0 g suivis d'un vrai ingrédient)", () => {
    const plan = planIngredientRepair([ing(1, "Levain", 0), ing(2, "Levure", 19)]);
    expect(plan).toEqual({ updates: [], deletes: [] });
  });
  it("garde les unités et fourchettes de la ligne de quantité", () => {
    const plan = planIngredientRepair([ing(1, "Lait", 0), ing(2, "250 ml", 0.25, "L")]);
    expect(plan.updates[0]).toMatchObject({ quantityG: 0.25, unit: "L" });
  });
});

describe("parseIngredientsText — quantité sur sa propre ligne", () => {
  it("recolle « 800g » au nom qui précède", () => {
    expect(parseIngredientsText("Abricots frais\n800g\nSucre\n- 100 g")).toEqual([
      { name: "Abricots frais", quantityG: 800, quantityGMax: undefined, unit: "g" },
      { name: "Sucre", quantityG: 100, quantityGMax: undefined, unit: "g" },
    ]);
  });
});

describe("planIngredientRepair — ligne de total", () => {
  it("supprime le total recopié comme dernier ingrédient", () => {
    const plan = planIngredientRepair([
      ing(1, "Sucre glace", 400), ing(2, "Fécule", 44), ing(3, "Gélatine", 8.9),
      ing(4, "Eau", 44), ing(5, "Vinaigre", 2.2), ing(6, "500g", 500),
    ]);
    expect(plan.deletes).toEqual([6]);
  });
  it("garde une dernière quantité qui n'est pas le total", () => {
    const plan = planIngredientRepair([ing(1, "Farine", 250), ing(2, "Beurre", 125), ing(3, "100g", 100)]);
    expect(plan.deletes).toEqual([]);
  });
});
