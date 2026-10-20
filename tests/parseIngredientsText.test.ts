import { describe, it, expect } from "vitest";
import { parseIngredientsText } from "@/lib/parseIngredientsText";

describe("parseIngredientsText", () => {
  it("retourne tableau vide si entrée vide", () => {
    expect(parseIngredientsText("")).toEqual([]);
    expect(parseIngredientsText("   \n  ")).toEqual([]);
  });

  it("parse format inline 'Xg nom'", () => {
    const result = parseIngredientsText("200g farine\n100g beurre");
    expect(result).toEqual([
      { name: "farine", quantityG: 200, unit: "g" },
      { name: "beurre", quantityG: 100, unit: "g" },
    ]);
  });

  it("nombre sans unité → pièces", () => {
    expect(parseIngredientsText("3 oeufs")[0]).toEqual({ name: "oeufs", quantityG: 3, unit: "pièce" });
  });

  it("convertit kg en grammes", () => {
    const result = parseIngredientsText("1kg sucre\n0,5 kg farine");
    expect(result[0]).toEqual({ name: "sucre", quantityG: 1000, unit: "g" });
    expect(result[1]).toEqual({ name: "farine", quantityG: 500, unit: "g" });
  });

  it("convertit ml et cl en litres", () => {
    expect(parseIngredientsText("500ml lait")[0]).toEqual({ name: "lait", quantityG: 0.5, unit: "L" });
    expect(parseIngredientsText("10cl crème")[0]).toEqual({ name: "crème", quantityG: 0.1, unit: "L" });
  });

  it("garde le NOMBRE de cuillères (pas de conversion en grammes)", () => {
    const result = parseIngredientsText("2 cc vanille\n1 cuillère à soupe huile");
    expect(result[0]).toEqual({ name: "vanille", quantityG: 2, unit: "cc" });
    expect(result[1]).toEqual({ name: "huile", quantityG: 1, unit: "cs" });
  });

  it("parse les fourchettes de poids", () => {
    expect(parseIngredientsText("100-150g sucre")[0]).toEqual({
      name: "sucre",
      quantityG: 100,
      quantityGMax: 150,
      unit: "g",
    });
  });

  it("parse format fiche pâtissier 'Nom\\n- Xg'", () => {
    const txt = "Farine\n- 200g\nBeurre\n- 100g\nSucre\n- 50g";
    const result = parseIngredientsText(txt);
    expect(result.map((r) => [r.name, r.quantityG, r.unit])).toEqual([
      ["Farine", 200, "g"],
      ["Beurre", 100, "g"],
      ["Sucre", 50, "g"],
    ]);
  });

  it("garde l'ingrédient sans quantité", () => {
    const result = parseIngredientsText("Vanille\nSel");
    expect(result).toEqual([
      { name: "Vanille", quantityG: 0, unit: "g" },
      { name: "Sel", quantityG: 0, unit: "g" },
    ]);
  });

  it("ignore les lignes vides", () => {
    const result = parseIngredientsText("200g farine\n\n\n100g beurre");
    expect(result).toHaveLength(2);
  });

  it("gère format style 'Nom - Xg'", () => {
    const result = parseIngredientsText("Crémeux caramel - 1kg");
    expect(result[0].name).toBe("Crémeux caramel");
    expect(result[0].quantityG).toBe(1000);
  });
});
