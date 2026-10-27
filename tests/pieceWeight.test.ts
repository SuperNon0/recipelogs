import { describe, it, expect } from "vitest";
import { ingMass, recipeMass, adjustToTarget } from "@/lib/massAdjust";
import { resolveLink, treeBaseMass, type TreeNode } from "@/lib/recipeTree";
import { formatYield } from "@/lib/format";

describe("poids par pièce", () => {
  it("une pièce sans poids connu ne compte pas", () => {
    expect(ingMass(3, "pièce")).toBe(0);
    expect(ingMass(3, "pièce", null)).toBe(0);
  });

  it("une pièce avec un poids compte dans la masse", () => {
    expect(ingMass(3, "pièce", 50)).toBe(150);
    // Le poids d'une pièce n'a aucun effet sur les autres unités.
    expect(ingMass(100, "g", 50)).toBe(100);
  });

  it("recipeMass compte les œufs à 50 g", () => {
    const m = recipeMass([
      { quantityG: 200, unit: "g" },
      { quantityG: 3, unit: "pièce", pieceG: 50 },
      { quantityG: 2, unit: "pièce", pieceG: 20, quantityGMax: 3 },
    ]);
    expect(m.min).toBe(390);
    expect(m.max).toBe(410);
  });

  it("l'ajustement à une masse cible ne touche pas aux pièces mais les compte", () => {
    const r = adjustToTarget(
      [
        { name: "Farine", quantityG: 101, quantityGMax: null, unit: "g" },
        { name: "Œufs", quantityG: 2, quantityGMax: null, unit: "pièce", pieceG: 50 },
      ],
      200,
    );
    expect(r.ingredients[0].quantityG).toBe(100);
    expect(r.ingredients[1].quantityG).toBe(2);
    expect(r.totalMassGMin).toBe(200);
  });

  it("le moteur de sous-recettes compte les pièces à tous les niveaux", () => {
    const creme: TreeNode = {
      id: 2, name: "Crème", steps: null, subLinks: [],
      ingredients: [
        { id: 20, name: "Lait", quantityG: 500, quantityGMax: null, unit: "g" },
        { id: 21, name: "Jaune", quantityG: 5, quantityGMax: null, unit: "pièce", pieceG: 20 },
      ],
    };
    expect(treeBaseMass(creme).avg).toBe(600);
    const res = resolveLink(
      { calcMode: "mass_target", calcValue: 300, pivotIngredientId: null, isLocked: false, isExact: false, child: creme },
      1,
    );
    expect(res.effectiveCoef).toBeCloseTo(0.5);
    expect(res.min).toBeCloseTo(250 + 3 * 20); // 2,5 jaunes arrondis à 3 pièces
    expect(res.ingredients[1].pieceG).toBe(20);
  });
});

describe("formatYield", () => {
  it("donne le poids d'une pièce", () => {
    expect(formatYield(40, "financiers", 1000)).toBe("40 financiers de 25 g");
  });
  it("sans masse, juste le nombre", () => {
    expect(formatYield(8, "parts", 0)).toBe("8 parts");
  });
});
