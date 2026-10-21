import { describe, it, expect } from "vitest";
import { computeLocalCoef } from "@/lib/subRecipes";
import { computeSubRecipe } from "@/lib/subRecipeCalc";

describe("computeLocalCoef", () => {
  describe("mode coefficient", () => {
    it("retourne le coefficient directement", () => {
      expect(computeLocalCoef("coefficient", 2.5, 500, null)).toBe(2.5);
    });
    it("retourne 1 si coefficient <= 0", () => {
      expect(computeLocalCoef("coefficient", 0, 500, null)).toBe(1);
      expect(computeLocalCoef("coefficient", -1, 500, null)).toBe(1);
    });
    it("retourne 1 si coefficient non fini", () => {
      expect(computeLocalCoef("coefficient", Infinity, 500, null)).toBe(1);
      expect(computeLocalCoef("coefficient", NaN, 500, null)).toBe(1);
    });
  });

  describe("mode mass_target", () => {
    it("calcule coef = cible / totalBase", () => {
      expect(computeLocalCoef("mass_target", 1000, 500, null)).toBe(2);
    });
    it("retourne 1 si childBaseTotalG <= 0", () => {
      expect(computeLocalCoef("mass_target", 1000, 0, null)).toBe(1);
      expect(computeLocalCoef("mass_target", 1000, -100, null)).toBe(1);
    });
    it("gère les fractions", () => {
      expect(computeLocalCoef("mass_target", 250, 1000, null)).toBeCloseTo(0.25);
    });
  });

  describe("mode pivot_ingredient", () => {
    it("calcule coef = cible / pivotBaseQty", () => {
      expect(computeLocalCoef("pivot_ingredient", 200, 500, 100)).toBe(2);
    });
    it("retourne 1 si pivotBaseQtyG nul ou <= 0", () => {
      expect(computeLocalCoef("pivot_ingredient", 200, 500, null)).toBe(1);
      expect(computeLocalCoef("pivot_ingredient", 200, 500, 0)).toBe(1);
      expect(computeLocalCoef("pivot_ingredient", 200, 500, -10)).toBe(1);
    });
    it("gère les fractions pivot", () => {
      expect(computeLocalCoef("pivot_ingredient", 50, 500, 200)).toBeCloseTo(0.25);
    });
  });
});

describe("computeSubRecipe", () => {
  const sr = {
    calcMode: "mass_target" as const,
    calcValue: 300,
    pivotIngredientId: null,
    isExact: false,
    childIngredients: [
      { id: 1, name: "Sucre", quantityG: 100, unit: "g" },
      { id: 2, name: "Blancs", quantityG: 50, unit: "g" },
    ],
  };
  it("suit le multiplicateur global quand elle n'est pas verrouillée", () => {
    const r = computeSubRecipe(sr, 2, false);
    expect(r.effectiveCoef).toBeCloseTo(4);
    expect(r.min).toBe(600);
  });
  it("garde sa propre quantité quand elle est verrouillée", () => {
    const r = computeSubRecipe(sr, 2, true);
    expect(r.effectiveCoef).toBeCloseTo(2);
    expect(r.min).toBe(300);
  });
  it("tombe pile sur la masse cible en mode exact", () => {
    const r = computeSubRecipe({ ...sr, calcValue: 250, isExact: true, childIngredients: [
      { id: 1, name: "A", quantityG: 33, unit: "g" },
      { id: 2, name: "B", quantityG: 67, unit: "g" },
    ] }, 1.3, false);
    expect(r.min).toBe(325);
  });
  it("convertit les litres en grammes", () => {
    const r = computeSubRecipe({ ...sr, calcMode: "coefficient", calcValue: 1, childIngredients: [
      { id: 1, name: "Lait", quantityG: 0.5, unit: "L" },
    ] }, 1, false);
    expect(r.ingredients[0]).toMatchObject({ quantityG: 500, unit: "g" });
  });
});
