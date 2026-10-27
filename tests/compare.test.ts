import { describe, expect, it } from "vitest";
import { compareRecipes, compareSteps } from "@/lib/compare";
import type { TreeNode } from "@/lib/recipeTree";

const node = (id: number, ings: [string, number, string?][], steps: string | null = null): TreeNode => ({
  id,
  name: `R${id}`,
  steps,
  ingredients: ings.map(([name, q, unit], i) => ({ id: id * 100 + i, name, quantityG: q, quantityGMax: null, unit: unit ?? "g" })),
  subLinks: [],
});

describe("comparer deux recettes", () => {
  it("rapproche les ingrédients par leur nom, sans accents ni majuscules", () => {
    const a = node(1, [["Crème 35%", 300], ["Chocolat noir", 280], ["Sel", 0, "QS"]]);
    const b = node(2, [["creme 35%", 320], ["Glucose", 30], ["Sel", 0, "QS"]]);
    const { rows, totalA, totalB } = compareRecipes(a, b);
    expect(rows.map((r) => [r.name, r.a, r.b])).toEqual([
      ["Crème 35%", 300, 320],
      ["Chocolat noir", 280, null],
      ["Sel", 0, 0],
      ["Glucose", null, 30],
    ]);
    expect(rows.find((r) => r.name === "Sel")?.note).toBe("QS");
    expect(totalA).toBe(580);
    expect(totalB).toBe(350);
  });

  it("ignore les intertitres", () => {
    const { rows } = compareRecipes(node(1, [["Pâte", 0, "titre"], ["Farine", 100]]), node(2, [["Farine", 100]]));
    expect(rows).toHaveLength(1);
  });

  it("marque les étapes qui diffèrent", () => {
    const s = compareSteps("Chauffer la crème.\nCristalliser 12 h.", "Chauffer la crème.\nCristalliser 24 h.");
    expect(s.a.map((l) => l.changed)).toEqual([false, true]);
    expect(s.b.map((l) => l.changed)).toEqual([false, true]);
  });
});
