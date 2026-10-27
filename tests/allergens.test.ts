import { describe, it, expect } from "vitest";
import { cleanAllergens, collectAllergens } from "@/lib/allergens";
import type { TreeNode } from "@/lib/recipeTree";

const ing = (name: string, allergens: string[] = []) => ({ id: 0, name, quantityG: 100, quantityGMax: null, unit: "g", allergens });

describe("allergènes", () => {
  it("nettoie : clés inconnues retirées, doublons fusionnés, ordre officiel", () => {
    expect(cleanAllergens(["lait", "inconnu", "gluten", "lait"])).toEqual(["gluten", "lait"]);
  });

  it("cumule les allergènes à tous les niveaux de sous-recettes", () => {
    const praline: TreeNode = { id: 3, name: "Praliné", steps: null, subLinks: [], ingredients: [ing("Noisettes", ["fruits_a_coque"])] };
    const creme: TreeNode = {
      id: 2, name: "Crème", steps: null, ingredients: [ing("Beurre", ["lait"]), ing("Jaune", ["oeufs"])],
      subLinks: [{ id: 9, label: "Praliné", childId: 3, childName: "Praliné", calcMode: "coefficient", calcValue: 1, pivotIngredientId: null, isLocked: false, isExact: false, child: praline }],
    };
    const root: TreeNode = {
      id: 1, name: "Paris-Brest", steps: null, ingredients: [ing("Farine", ["gluten"]), ing("Lait", ["lait"]), ing("Sucre")],
      subLinks: [{ id: 8, label: "Crème mousseline", childId: 2, childName: "Crème", calcMode: "coefficient", calcValue: 1, pivotIngredientId: null, isLocked: false, isExact: false, child: creme }],
    };
    const hits = collectAllergens(root);
    expect(hits.map((h) => h.label)).toEqual(["Gluten", "Œufs", "Lait", "Fruits à coque"]);
    expect(hits.find((h) => h.key === "lait")!.sources).toEqual(["Lait", "Beurre (Crème mousseline)"]);
    expect(hits.find((h) => h.key === "fruits_a_coque")!.sources).toEqual(["Noisettes (Praliné)"]);
  });

  it("aucun allergène coché : liste vide", () => {
    expect(collectAllergens({ id: 1, name: "Sirop", steps: null, subLinks: [], ingredients: [ing("Eau"), ing("Sucre")] })).toEqual([]);
  });
});
