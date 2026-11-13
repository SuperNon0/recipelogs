import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), visible: vi.fn(), loadTree: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireAccess: mocks.guard }));
vi.mock("@/lib/auth/visibility", () => ({ canSeeRecipe: mocks.visible }));
vi.mock("@/lib/recipes", () => ({ loadRecipeTree: mocks.loadTree }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/shopping", () => ({ visibleShoppingListWhere: vi.fn() }));
import { fetchRecipeMassInfo } from "@/app/actions/modals";

beforeEach(() => { vi.clearAllMocks(); mocks.visible.mockResolvedValue(true); });
describe("données de calcul de la fenêtre cahier", () => {
  it("refuse une recette cachée avant de charger son arbre", async () => {
    mocks.visible.mockResolvedValue(false);
    expect(await fetchRecipeMassInfo(1)).toBeNull();
    expect(mocks.loadTree).not.toHaveBeenCalled();
    expect(mocks.guard).toHaveBeenCalledWith("read");
  });
  it("convertit les pivots en grammes et retire les prix de tout l'arbre renvoyé", async () => {
    const cost = { price: 5, unit: "kg" };
    const tree = { id: 1, name: "R", steps: null, ingredients: [
      { id: 1, name: "Lait", quantityG: 0.5, quantityGMax: null, unit: "L", cost },
      { id: 2, name: "Œuf", quantityG: 2, quantityGMax: null, unit: "pièce", pieceG: 50, cost },
      { id: 3, name: "Sel", quantityG: 0, quantityGMax: null, unit: "QS", cost },
    ], subLinks: [{ id: 1, childId: 2, childName: "Crème", label: "Crème", calcMode: "coefficient", calcValue: 1,
      pivotIngredientId: null, isLocked: false, isExact: false,
      child: { id: 2, name: "Crème", steps: null, subLinks: [], ingredients: [
        { id: 4, name: "Sucre", quantityG: 100, quantityGMax: null, unit: "g", cost },
      ] } } ] };
    mocks.loadTree.mockResolvedValue(tree);
    const info = (await fetchRecipeMassInfo(1))!;
    expect(info.totalMassG).toBe(700);
    expect(info.ingredients).toEqual([{ name: "Lait", quantityG: 500 }, { name: "Œuf", quantityG: 100 }]);
    expect(info.tree.ingredients.every(i => i.cost === null)).toBe(true);
    expect(info.tree.subLinks[0].child.ingredients[0].cost).toBeNull();
  });
});
