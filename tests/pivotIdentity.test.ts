import { describe, expect, it } from "vitest";
import { matchPivotIngredient } from "@/lib/pivotIdentity";

describe("identité d'un ingrédient pivot après modification", () => {
  const flour = { id: 1, name: "Farine" };
  const sugar = { id: 2, name: "Sucre" };
  it("retrouve le pivot unique même après déplacement", () => {
    expect(matchPivotIngredient(flour, [flour, sugar], [{ id: 20, name: "Sucre" }, { id: 10, name: "farine" }]).id).toBe(10);
  });
  it("refuse de remplacer la farine supprimée par le sucre remonté à sa position", () => {
    expect(() => matchPivotIngredient(flour, [flour, sugar], [{ id: 20, name: "Sucre" }])).toThrow(/pivot/);
  });
  it("refuse une identité ambiguë avant ou après enregistrement", () => {
    expect(() => matchPivotIngredient(flour, [flour, { id: 3, name: "Farine" }], [{ id: 10, name: "Farine" }])).toThrow(/pivot/);
    expect(() => matchPivotIngredient(flour, [flour], [{ id: 10, name: "Farine" }, { id: 11, name: "Farine" }])).toThrow(/pivot/);
  });
});
