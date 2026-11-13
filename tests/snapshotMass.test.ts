import { describe, expect, it } from "vitest";
import { resizeSnapshot, snapshotMassInfo, type MassSnapshot } from "@/lib/snapshotMass";

const ing = (quantityG: number, unit = "g") => ({ name: "Ingrédient", quantityG, unit });
describe("masse complète d'une recette figée", () => {
  const legacy: MassSnapshot = {
    ingredients: [ing(100)], totalMassG: 100,
    subRecipes: [{ ingredients: [ing(100)], totalMassG: 100, isLocked: true },
      { ingredients: [ing(300)], totalMassG: 300 }],
  };
  it("inclut les sous-recettes dans la cible sans déplacer la part verrouillée legacy", () => {
    const out = resizeSnapshot(legacy, { mode: "mass_target", targetMassG: 900 });
    expect(snapshotMassInfo(out)).toEqual({ totalMassG: 900, fixedMassG: 100 });
    expect(out.ingredients[0].quantityG).toBe(200);
    expect(out.subRecipes?.[0].ingredients[0].quantityG).toBe(100);
    expect(out.subRecipes?.[1].ingredients[0].quantityG).toBe(600);
    expect(legacy.ingredients[0].quantityG).toBe(100);
  });
  it("atteint une cible exacte pour une recette composée uniquement de sous-recettes", () => {
    const out = resizeSnapshot({ ingredients: [], totalMassG: 0, subRecipes: [
      { ingredients: [ing(100), ing(100)], totalMassG: 200 },
    ] }, { mode: "mass_target", targetMassG: 301, forceExact: true });
    expect(out.totalMassG).toBe(0);
    expect(out.subRecipes?.[0].totalMassG).toBe(301);
    expect(snapshotMassInfo(out).totalMassG).toBe(301);
  });
  it("respecte les verrous imbriqués au niveau de chaque ingrédient", () => {
    const out = resizeSnapshot({ ingredients: [], totalMassG: 0, subRecipes: [
      { ingredients: [ing(100), ing(100), ing(100)], totalMassG: 300, fixedIngredients: [true, false, false] },
    ] }, { mode: "mass_target", targetMassG: 401, forceExact: true });
    expect(out.subRecipes?.[0].ingredients[0].quantityG).toBe(100);
    expect(snapshotMassInfo(out)).toEqual({ totalMassG: 401, fixedMassG: 100 });
  });
  it("rejette une cible inférieure aux verrous et une masse exacte irréalisable", () => {
    expect(() => resizeSnapshot(legacy, { mode: "mass_target", targetMassG: 90 })).toThrow(/verrouill/);
    expect(() => resizeSnapshot({ ingredients: [{ ...ing(1, "pièce"), pieceG: 50 }], totalMassG: 50 },
      { mode: "mass_target", targetMassG: 10, forceExact: true })).toThrow(/exacte impossible/);
  });
  it("accepte une cible inchangée quand tout est verrouillé", () => {
    const fixed: MassSnapshot = { ingredients: [], totalMassG: 0, subRecipes: [{ ingredients: [ing(100)], totalMassG: 100, isLocked: true }] };
    expect(snapshotMassInfo(resizeSnapshot(fixed, { mode: "mass_target", targetMassG: 100, forceExact: true })).totalMassG).toBe(100);
    expect(() => resizeSnapshot(fixed, { mode: "mass_target", targetMassG: 200 })).toThrow(/libre/);
  });
  it("convertit les litres et utilise le poids réel du pivot", () => {
    const out = resizeSnapshot({ ingredients: [ing(1, "L")], totalMassG: 1000 }, { mode: "pivot_ingredient", pivotIndex: 0, targetMassG: 500 });
    expect(out.ingredients[0]).toMatchObject({ quantityG: 500, unit: "g" });
    expect(out.totalMassG).toBe(500);
  });
});
