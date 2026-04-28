import { describe, it, expect } from "vitest";
import { parseIngredientsText } from "@/lib/parseIngredientsText";

describe("parseIngredientsText", () => {
  it("retourne tableau vide si entrée vide", () => {
    expect(parseIngredientsText("")).toEqual([]);
    expect(parseIngredientsText("   \n  ")).toEqual([]);
  });

  it("parse format inline 'Xg nom'", () => {
    const result = parseIngredientsText("200g farine\n100g beurre\n3 oeufs");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "farine", quantityG: 200 });
    expect(result[1]).toEqual({ name: "beurre", quantityG: 100 });
    expect(result[2].name.toLowerCase()).toContain("oeuf");
  });

  it("convertit kg en grammes", () => {
    const result = parseIngredientsText("1kg sucre\n0,5 kg farine");
    expect(result[0]).toEqual({ name: "sucre", quantityG: 1000 });
    expect(result[1]).toEqual({ name: "farine", quantityG: 500 });
  });

  it("convertit ml en grammes (1ml ≈ 1g)", () => {
    const result = parseIngredientsText("500ml lait");
    expect(result[0]).toEqual({ name: "lait", quantityG: 500 });
  });

  it("convertit cl en grammes", () => {
    const result = parseIngredientsText("10cl crème");
    expect(result[0].quantityG).toBe(100);
  });

  it("parse format fiche pâtissier 'Nom\\n- Xg'", () => {
    const txt = "Farine\n- 200g\nBeurre\n- 100g\nSucre\n- 50g";
    const result = parseIngredientsText(txt);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "Farine", quantityG: 200 });
    expect(result[1]).toEqual({ name: "Beurre", quantityG: 100 });
    expect(result[2]).toEqual({ name: "Sucre", quantityG: 50 });
  });

  it("garde l'ingrédient sans quantité quand pas de g/kg/ml", () => {
    const result = parseIngredientsText("Vanille\nSel");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "Vanille", quantityG: 0 });
    expect(result[1]).toEqual({ name: "Sel", quantityG: 0 });
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
