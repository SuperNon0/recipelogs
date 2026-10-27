import { describe, expect, it } from "vitest";
import { buildProduction, productionCoef } from "@/lib/production";
import type { TreeNode } from "@/lib/recipeTree";

const leaf = (id: number, name: string, ings: [string, number, string?][]): TreeNode => ({
  id,
  name,
  steps: null,
  ingredients: ings.map(([n, q, unit], i) => ({ id: id * 100 + i, name: n, quantityG: q, quantityGMax: null, unit: unit ?? "g" })),
  subLinks: [],
});

const creme = leaf(1, "Crème pâtissière", [["Lait", 1000], ["Sucre", 200]]);
const link = (child: TreeNode, value: number, id = child.id * 10) => ({
  id,
  label: child.name,
  childId: child.id,
  childName: child.name,
  calcMode: "mass_target" as const,
  calcValue: value,
  pivotIngredientId: null,
  isLocked: false,
  isExact: false,
  child,
});

describe("fiche de production", () => {
  it("met chaque préparation à l'échelle, sous-recettes d'abord", () => {
    const eclair: TreeNode = { ...leaf(2, "Éclair", [["Fondant", 400]]), subLinks: [link(creme, 600)] };
    const p = buildProduction([{ tree: eclair, coef: 2, target: "60 éclairs" }]);
    expect(p.blocks.map((b) => b.name)).toEqual(["Crème pâtissière", "Éclair"]);
    // 600 g de crème ×2 = 1 200 g : lait 1 000 g sur 1 200 g → 1 000 g.
    expect(p.blocks[0].lines).toEqual([
      { kind: "ing", name: "Lait", qty: 1000, unit: "g", grams: 1000 },
      { kind: "ing", name: "Sucre", qty: 200, unit: "g", grams: 200 },
    ]);
    expect(p.blocks[0].usedIn).toEqual(["Éclair"]);
    expect(p.blocks[1]).toMatchObject({ isProduct: true, target: "60 éclairs", massG: 800 });
    expect(p.massG).toBe(2000);
  });

  it("additionne une sous-recette partagée par deux recettes et fait le total par ingrédient", () => {
    const a: TreeNode = { ...leaf(2, "Éclair", [["Sucre", 10]]), subLinks: [link(creme, 600)] };
    const b: TreeNode = { ...leaf(3, "Tartelette", []), subLinks: [link(creme, 300, 99)] };
    const p = buildProduction([{ tree: a, coef: 1 }, { tree: b, coef: 1 }]);
    const cremeBlocks = p.blocks.filter((x) => x.recipeId === 1);
    expect(cremeBlocks).toHaveLength(1);
    expect(cremeBlocks[0].massG).toBeCloseTo(900, 6);
    expect(cremeBlocks[0].usedIn).toEqual(["Éclair", "Tartelette"]);
    expect(p.totals.find((t) => t.name === "Sucre")?.qty).toBeCloseTo(160, 6);
  });

  it("coefficient : pièces si rendement, sinon multiplicateur", () => {
    expect(productionCoef(60, 30)).toBe(2);
    expect(productionCoef(3, null)).toBe(3);
  });
});
