import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
// Next server-action deps : neutralisées pour laisser tourner en environnement node.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { findMany, subFindMany, executeRaw } = vi.hoisted(() => ({
  findMany: vi.fn(),
  subFindMany: vi.fn(),
  executeRaw: vi.fn(async () => 0),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ingredient: { findMany },
    subRecipe: { findMany: subFindMany },
    $executeRaw: executeRaw,
  },
}));

// On importe APRÈS les mocks pour qu'ils prennent.
import { applyMultiplierToRecipe } from "@/app/actions/recipes";

beforeEach(() => {
  findMany.mockReset();
  subFindMany.mockReset();
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(0);
});

describe("applyMultiplierToRecipe", () => {
  it("rejette un multiplicateur invalide", async () => {
    const r = await applyMultiplierToRecipe(1, -1);
    expect(r.ok).toBe(false);
  });

  it("no-op si multiplicateur ≈ 1", async () => {
    const r = await applyMultiplierToRecipe(1, 1.00001);
    expect(r).toEqual({ ok: true });
    expect(findMany).not.toHaveBeenCalled();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("échoue si aucun ingrédient", async () => {
    subFindMany.mockResolvedValue([]);
    findMany.mockResolvedValue([]);
    const r = await applyMultiplierToRecipe(1, 2);
    expect(r.ok).toBe(false);
  });

  it("émet un UNIQUE UPDATE SQL batché (pas N update)", async () => {
    subFindMany.mockResolvedValue([]);
    findMany.mockResolvedValue([
      { id: 10, quantityG: 100 },
      { id: 11, quantityG: 250 },
      { id: 12, quantityG: 33.333 },
    ]);
    const r = await applyMultiplierToRecipe(1, 2);
    expect(r).toEqual({ ok: true });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("bloque et renvoie usedInPivotOf si recette utilisée comme pivot", async () => {
    subFindMany.mockResolvedValue([
      { parent: { id: 42, name: "Entremet A" } },
      { parent: { id: 42, name: "Entremet A" } }, // doublon volontaire
      { parent: { id: 43, name: "Tarte B" } },
    ]);
    const r = await applyMultiplierToRecipe(1, 2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.usedInPivotOf).toEqual([
      { id: 42, name: "Entremet A" },
      { id: 43, name: "Tarte B" },
    ]);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("passe malgré usedInPivot si confirmed=true", async () => {
    subFindMany.mockResolvedValue([{ parent: { id: 42, name: "Entremet A" } }]);
    findMany.mockResolvedValue([{ id: 10, quantityG: 100 }]);
    const r = await applyMultiplierToRecipe(1, 2, true);
    expect(r).toEqual({ ok: true });
    // Aucune vérif pivot demandée quand confirmed=true.
    expect(subFindMany).not.toHaveBeenCalled();
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });
});
