import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/cookbooks", () => ({ buildRecipeSnapshot: vi.fn() }));
vi.mock("@/lib/pdf/theme", () => ({
  parseTheme: (v: unknown) => v,
  cookbookThemeSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
}));

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    cookbookRecipe: { findUnique, update },
  },
}));

import { updateSnapshotMass } from "@/app/actions/cookbooks";

const baseSnap = {
  ingredients: [
    { name: "Farine", quantityG: 200 },
    { name: "Sucre", quantityG: 100 },
  ],
  totalMassG: 300,
  subRecipes: [
    { ingredients: [{ name: "Beurre", quantityG: 50 }], totalMassG: 50 },
  ],
  multiplier: 1,
};

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  update.mockResolvedValue({});
});

describe("updateSnapshotMass", () => {
  it("rejette si entrée absente", async () => {
    findUnique.mockResolvedValue(null);
    const r = await updateSnapshotMass(
      1,
      { mode: "coefficient", coefficient: 2 },
      99,
    );
    expect(r.ok).toBe(false);
  });

  it("rejette si l'entrée n'est pas figée", async () => {
    findUnique.mockResolvedValue({ linkMode: "linked", snapshotData: null });
    const r = await updateSnapshotMass(
      1,
      { mode: "coefficient", coefficient: 2 },
      99,
    );
    expect(r.ok).toBe(false);
  });

  it("applique un coefficient ×2 en mode coefficient", async () => {
    findUnique.mockResolvedValue({ linkMode: "snapshot", snapshotData: baseSnap });
    const r = await updateSnapshotMass(
      1,
      { mode: "coefficient", coefficient: 2 },
      99,
    );
    expect(r).toEqual({ ok: true });
    const written = update.mock.calls[0][0].data.snapshotData;
    expect(written.totalMassG).toBe(600);
    expect(written.ingredients).toEqual([
      { name: "Farine", quantityG: 400 },
      { name: "Sucre", quantityG: 200 },
    ]);
    expect(written.subRecipes[0].ingredients[0].quantityG).toBe(100);
    expect(written.multiplier).toBe(2);
  });

  it("mode mass_target : ratio = cible / total actuel", async () => {
    findUnique.mockResolvedValue({ linkMode: "snapshot", snapshotData: baseSnap });
    const r = await updateSnapshotMass(
      1,
      { mode: "mass_target", targetMassG: 150 },
      99,
    );
    expect(r).toEqual({ ok: true });
    const written = update.mock.calls[0][0].data.snapshotData;
    expect(written.totalMassG).toBe(150);
    expect(written.ingredients[0].quantityG).toBe(100);
    expect(written.ingredients[1].quantityG).toBe(50);
  });

  it("mode pivot_ingredient : ratio = cible / qté du pivot indexé", async () => {
    findUnique.mockResolvedValue({ linkMode: "snapshot", snapshotData: baseSnap });
    // pivotIndex=1 (Sucre, 100 g), cible 200 → ratio 2
    const r = await updateSnapshotMass(
      1,
      { mode: "pivot_ingredient", pivotIndex: 1, targetMassG: 200 },
      99,
    );
    expect(r).toEqual({ ok: true });
    const written = update.mock.calls[0][0].data.snapshotData;
    expect(written.ingredients[1].quantityG).toBe(200);
    expect(written.ingredients[0].quantityG).toBe(400);
  });

  it("arrondit au millième via roundQty", async () => {
    findUnique.mockResolvedValue({
      linkMode: "snapshot",
      snapshotData: { ingredients: [{ name: "x", quantityG: 100 }], totalMassG: 100 },
    });
    const r = await updateSnapshotMass(
      1,
      { mode: "coefficient", coefficient: 1 / 3 },
      99,
    );
    expect(r).toEqual({ ok: true });
    const written = update.mock.calls[0][0].data.snapshotData;
    expect(written.ingredients[0].quantityG).toBe(33.333);
  });
});
