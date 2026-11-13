import { beforeEach, describe, expect, it, vi } from "vitest";
import { treeCoefficientForMass, treeScaledMass, type TreeNode, type TreeLink } from "@/lib/recipeTree";
import { recipeMass } from "@/lib/massAdjust";

const mocks = vi.hoisted(() => ({ findUnique: vi.fn(), loadTree: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/recipes", () => ({ loadRecipeTree: mocks.loadTree }));
vi.mock("@/lib/auth/visibility", () => ({ hiddenCookbookIds: vi.fn() }));
import { buildRecipeSnapshot } from "@/lib/cookbooks";

function node(id: number, quantity = 0, subLinks: TreeLink[] = []): TreeNode {
  return { id, name: `R${id}`, steps: null, subLinks, ingredients: quantity ? [
    { id: id * 10, name: "Farine", quantityG: quantity, quantityGMax: null, unit: "g" },
  ] : [] };
}
function link(child: TreeNode, locked = false, mode: TreeLink["calcMode"] = "coefficient", value = 1): TreeLink {
  return { id: child.id, childId: child.id, childName: child.name, label: child.name,
    child, calcMode: mode, calcValue: value, pivotIngredientId: null, isLocked: locked, isExact: false };
}
const fullMass = (s: NonNullable<Awaited<ReturnType<typeof buildRecipeSnapshot>>>) =>
  recipeMass([...s.ingredients, ...s.subRecipes.flatMap((sr) => sr.ingredients)]).avg;

beforeEach(() => {
  mocks.findUnique.mockResolvedValue({ id: 1, name: "Entremets", tags: [], categories: [], yieldCount: 30, yieldLabel: "pièces" });
});

describe("cahiers : masse de toutes les préparations", () => {
  it("une cible identique à la masse complète garde ×1, sans multiplier les sous-recettes par cinq", async () => {
    mocks.loadTree.mockResolvedValue(node(1, 100, [link(node(2, 400))]));
    const s = (await buildRecipeSnapshot(1, 1, { target: 500 }))!;
    expect(s.multiplier).toBe(1);
    expect(fullMass(s)).toBe(500);
    expect(s.totalMassG).toBe(100); // format historique : total propre de la préparation
  });
  it("ajuste une recette uniquement faite de sous-recettes", async () => {
    mocks.loadTree.mockResolvedValue(node(1, 0, [link(node(2, 400))]));
    const s = (await buildRecipeSnapshot(1, 1, { target: 800 }))!;
    expect(s.multiplier).toBeCloseTo(2);
    expect(fullMass(s)).toBe(800);
  });
  it("compte les litres et le poids des pièces", async () => {
    const tree = node(1);
    tree.ingredients = [
      { id: 10, name: "Lait", quantityG: 0.5, quantityGMax: null, unit: "L" },
      { id: 11, name: "Œuf", quantityG: 2, quantityGMax: null, unit: "pièce", pieceG: 50 },
    ];
    mocks.loadTree.mockResolvedValue(tree);
    const s = (await buildRecipeSnapshot(1, 1, { target: 1200 }))!;
    expect(fullMass(s)).toBe(1200);
    expect(s.ingredients[0]).toMatchObject({ quantityG: 1000, unit: "g" });
    expect(s.ingredients[1].quantityG).toBe(4);
  });
  it("répartit l'arrondi exact entre préparations, sans retoucher un insert verrouillé imbriqué", async () => {
    const child = node(2, 101, [link(node(3, 100), true)]);
    mocks.loadTree.mockResolvedValue(node(1, 103, [link(child)]));
    const s = (await buildRecipeSnapshot(1, 1, { target: 407, exact: true }))!;
    expect(fullMass(s)).toBe(407);
    expect(s.subRecipes[0].ingredients.find((i) => i.quantityG === 100)).toBeDefined();
    expect(s.subRecipes[0].fixedIngredients).toEqual([false, true]);
  });
  it("une cible inférieure au verrouillage conserve ce verrouillage et met le reste à zéro", async () => {
    mocks.loadTree.mockResolvedValue(node(1, 100, [link(node(2, 200), true)]));
    const s = (await buildRecipeSnapshot(1, 1, { target: 50 }))!;
    expect(fullMass(s)).toBe(200);
    expect(s.ingredients[0].quantityG).toBe(0);
    await expect(buildRecipeSnapshot(1, 1, { target: 50, exact: true })).rejects.toThrow("Masse exacte impossible");
  });
  it("résout les paliers des masses cibles imbriquées", () => {
    const child = node(2, 100, [link(node(3, 100), true)]);
    const tree = node(1, 100, [link(child, false, "mass_target", 200)]);
    // À ×0,25, l'enfant reste à 100 g (sa part fixe), le parent ajoute 25 g.
    const k = treeCoefficientForMass(tree, 125);
    expect(k).toBeCloseTo(0.25);
    expect(treeScaledMass(tree, k)).toBeCloseTo(125);
  });
  it("refuse une cible supérieure au contenu d'une recette entièrement verrouillée", () => {
    const tree = node(1, 0, [link(node(2, 100), true)]);
    expect(() => treeCoefficientForMass(tree, 200)).toThrow("aucune masse ajustable");
  });
});
