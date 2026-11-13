import { describe, expect, it, vi, beforeEach } from "vitest";
import { importYield } from "@/lib/importYield";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn(), guard: vi.fn() }));
vi.mock("@/lib/auth/guard", () => ({ requireAccess: mocks.guard }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { create: mocks.create, findFirst: mocks.findFirst } } }));
vi.mock("@/lib/ingredientBases", () => ({ ensureIngredientBases: vi.fn() }));
vi.mock("@/lib/recipes", () => ({ normalizeForSearch: (s: string) => s.toLowerCase() }));

import { importRecipeKeeperCsv, importRecipeKeeperHtmlOrZip } from "@/app/actions/import";

describe("rendement importé", () => {
  it.each([["12 parts", 12, "parts"], ["Pour 8 personnes", 8, "personnes"], ["24", 24, null], ["40 financiers", 40, "financiers"]])("reconnaît %s", (text, count, label) => {
    expect(importYield(String(text), "Notes")).toEqual({ yieldCount: count, yieldLabel: label, notesTips: "Notes" });
  });

  it.each(["1080g", "2 kg de pâte", "500 ml", "6 à 8 parts", "2,5 portions", "0", "100001 parts", "une tarte"])("préserve %s en notes sans inventer un nombre de pièces", (text) => {
    expect(importYield(text, "Notes")).toEqual({ yieldCount: null, yieldLabel: null, notesTips: `Notes\nRendement : ${text}` });
  });

  it("ne crée aucune note pour un rendement absent", () => {
    expect(importYield(null, null)).toEqual({ yieldCount: null, yieldLabel: null, notesTips: null });
  });
});

describe("persistance du rendement Recipe Keeper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 1 });
  });

  it("enregistre la colonne Servings du CSV", async () => {
    const data = new FormData();
    data.set("file", new File(["Name,Ingredients,Servings\nFinanciers,100g farine,40 financiers"], "recipes.csv"));
    const result = await importRecipeKeeperCsv(data);
    expect(result.imported).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ yieldCount: 40, yieldLabel: "financiers" }) }));
    expect(mocks.guard).toHaveBeenCalledWith("import.run");
  });

  it.each([["12 parts", 12, "parts", null], ["1080g", null, null, "Rendement : 1080g"]])("enregistre le recipeYield HTML %s", async (text, count, label, notes) => {
    const data = new FormData();
    data.set("file", new File([`<div class="recipe-details"><h2 itemprop="name">Tarte</h2><span itemprop="recipeYield">${text}</span></div>`], "recipes.html"));
    const result = await importRecipeKeeperHtmlOrZip(data);
    expect(result.errors).toEqual([]);
    expect(result.imported).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ yieldCount: count, yieldLabel: label, notesTips: notes }) }));
  });
});
