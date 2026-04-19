import { describe, it, expect } from "vitest";
import { computeLocalCoef } from "@/lib/subRecipes";

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
