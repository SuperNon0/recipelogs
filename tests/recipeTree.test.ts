import { describe, it, expect } from "vitest";
import { resolveLink, treeBaseMass, type TreeNode, type TreeLink, type TreeIngredient } from "@/lib/recipeTree";

// ── Helpers de construction d'arbres ──────────────────────────
let idc = 1;
const ing = (name: string, quantityG: number, unit = "g", quantityGMax: number | null = null): TreeIngredient => ({
  id: idc++, name, quantityG, quantityGMax, unit,
});
const node = (name: string, ingredients: TreeIngredient[], subLinks: TreeLink[] = []): TreeNode => ({
  id: idc++, name, steps: null, ingredients, subLinks,
});
type LinkOpts = Partial<Pick<TreeLink, "calcMode" | "calcValue" | "pivotIngredientId" | "isLocked" | "isExact" | "label">>;
const link = (child: TreeNode, opts: LinkOpts = {}): TreeLink => ({
  id: idc++,
  label: opts.label ?? child.name,
  childId: child.id,
  childName: child.name,
  calcMode: opts.calcMode ?? "coefficient",
  calcValue: opts.calcValue ?? 1,
  pivotIngredientId: opts.pivotIngredientId ?? null,
  isLocked: opts.isLocked ?? false,
  isExact: opts.isExact ?? false,
  child,
});

describe("recipeTree — sous-recettes imbriquées", () => {
  it("inclut les ingrédients d'une sous-recette du 2e niveau (le bug principal)", () => {
    const c = node("Crème anglaise", [ing("Lait", 0.5, "L"), ing("Sucre", 100)]);
    const b = node("Île flottante", [ing("Beurre", 200)], [link(c)]);
    const r = resolveLink(link(b), 1);
    // 3 ingrédients : Beurre (direct) + Lait + Sucre (imbriqués)
    expect(r.ingredients.map((i) => i.name)).toEqual(["Beurre", "Lait", "Sucre"]);
    expect(r.min).toBe(800); // 200 + 500 + 100 (avant le fix : 200 seulement)
  });

  it("additionne récursivement la masse de base (treeBaseMass)", () => {
    const c = node("C", [ing("Lait", 0.5, "L"), ing("Sucre", 100)]); // 600 g
    const b = node("B", [ing("Beurre", 200)], [link(c)]); // 200 + 600
    expect(treeBaseMass(b).avg).toBe(800);
  });

  it("multiplie tout l'arbre d'un coup, avec un seul arrondi par ingrédient", () => {
    const c = node("C", [ing("Lait", 0.5, "L"), ing("Sucre", 100)]);
    const b = node("B", [ing("Beurre", 200)], [link(c)]);
    const r = resolveLink(link(b), 2);
    expect(r.ingredients.find((i) => i.name === "Lait")).toMatchObject({ quantityG: 1000, unit: "g" });
    expect(r.ingredients.find((i) => i.name === "Beurre")).toMatchObject({ quantityG: 400 });
    expect(r.min).toBe(1600);
  });

  it("respecte le verrouillage d'une sous-recette imbriquée quand le parent est multiplié", () => {
    const c = node("C", [ing("Lait", 0.5, "L"), ing("Sucre", 100)]); // 600 g, verrouillée
    const b = node("B", [ing("Beurre", 200)], [link(c, { isLocked: true })]);
    const r = resolveLink(link(b), 2); // ×2 sur B
    // Beurre double (400), mais C verrouillée reste à 600
    expect(r.ingredients.find((i) => i.name === "Beurre")).toMatchObject({ quantityG: 400 });
    expect(r.ingredients.find((i) => i.name === "Lait")).toMatchObject({ quantityG: 500 });
    expect(r.min).toBe(1000); // 400 + 500 + 100
  });

  it("applique le mode « masse cible » à une sous-recette imbriquée", () => {
    const c = node("C", [ing("Lait", 0.5, "L"), ing("Sucre", 100)]); // base 600
    const b = node("B", [ing("Beurre", 200)], [link(c, { calcMode: "mass_target", calcValue: 1200 })]);
    const r = resolveLink(link(b), 1);
    // C visée à 1200 (coef interne 2) ; B = 200 + 1200
    expect(r.min).toBe(1400);
    expect(treeBaseMass(b).avg).toBe(1400);
  });

  it("mode pivot sur un ingrédient imbriqué en litres : la cible est en grammes", () => {
    const lait = ing("Lait", 0.5, "L"); // 500 g
    const c = node("C", [lait, ing("Sucre", 100)]); // base 600
    // On veut 1000 g de lait → coef 2 (et non 2000)
    const b = node("B", [ing("Beurre", 200)], [link(c, { calcMode: "pivot_ingredient", calcValue: 1000, pivotIngredientId: lait.id })]);
    const r = resolveLink(link(b), 1);
    expect(r.ingredients.find((i) => i.name === "Lait")).toMatchObject({ quantityG: 1000, unit: "g" });
    expect(r.min).toBe(1400); // 200 + 1000 + 200
  });

  it("sous-recette simple (sans imbrication) : même résultat qu'avant, exact à ×1", () => {
    const b = node("Crème", [ing("A", 33), ing("B", 67)]); // 100
    const r = resolveLink(link(b), 1);
    expect(r.min).toBe(100);
    const r2 = resolveLink(link(b), 2);
    expect(r2.min).toBe(200);
  });

  it("gère 3 niveaux d'imbrication", () => {
    const d = node("D", [ing("Eau", 50)]); // niveau 3
    const c = node("C", [ing("Sucre", 100)], [link(d)]); // niveau 2, base 150
    const b = node("B", [ing("Beurre", 200)], [link(c)]); // niveau 1, base 350
    const r = resolveLink(link(b), 1);
    expect(r.ingredients.map((i) => i.name)).toEqual(["Beurre", "Sucre", "Eau"]);
    expect(r.min).toBe(350);
  });
});

describe("masse cible avec une sous-recette verrouillée à l'intérieur", () => {
  const n = (id: number, ings: [string, number][], subLinks: TreeLink[] = []): TreeNode => ({
    id,
    name: `R${id}`,
    steps: null,
    ingredients: ings.map(([name, q], i) => ({ id: id * 100 + i, name, quantityG: q, quantityGMax: null, unit: "g" })),
    subLinks,
  });
  const l = (child: TreeNode, mode: TreeLink["calcMode"], value: number, extra: Partial<TreeLink> = {}): TreeLink => ({
    id: child.id * 10,
    label: child.name,
    childId: child.id,
    childName: child.name,
    calcMode: mode,
    calcValue: value,
    pivotIngredientId: null,
    isLocked: false,
    isExact: false,
    child,
    ...extra,
  });
  const insert = n(1, [["Fruit", 100]]);
  const creme = n(2, [["Lait", 300], ["Sucre", 100]], [l(insert, "coefficient", 1, { isLocked: true })]);
  it("la crème réglée sur 500 g fait 500 g, l'insert verrouillé reste à 100 g", () => {
    const r = resolveLink(l(creme, "mass_target", 500), 1);
    expect((r.min + r.max) / 2).toBeCloseTo(500, 6);
    expect(r.ingredients.find((i) => i.name === "Fruit")!.quantityG).toBe(100);
  });
  it("« exact » ne rabote pas l'insert verrouillé", () => {
    const r = resolveLink(l(creme, "mass_target", 777, { isExact: true }), 1);
    expect(r.min).toBe(777);
    expect(r.ingredients.find((i) => i.name === "Fruit")!.quantityG).toBe(100);
  });
});
