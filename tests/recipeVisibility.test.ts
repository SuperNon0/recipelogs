import { describe, expect, it } from "vitest";
import { expandWithSubRecipes } from "@/lib/auth/visibility";

describe("recettes visibles d'un rôle limité à des catégories", () => {
  it("ajoute les sous-recettes, à tous les niveaux, sans boucler", () => {
    // 1 (tarte) utilise 2 (pâte sucrée) qui utilise 3 (crème d'amande) ; 4 n'est pas liée.
    const links = [
      { parentId: 1, childId: 2 },
      { parentId: 2, childId: 3 },
      { parentId: 3, childId: 1 }, // boucle accidentelle
      { parentId: 4, childId: 2 },
    ];
    expect([...expandWithSubRecipes([1], links)].sort()).toEqual([1, 2, 3]);
    expect([...expandWithSubRecipes([2], links)].sort()).toEqual([1, 2, 3]);
    expect([...expandWithSubRecipes([], links)]).toEqual([]);
  });
});
