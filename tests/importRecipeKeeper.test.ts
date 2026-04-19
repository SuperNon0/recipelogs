import { describe, it, expect } from "vitest";
import { parseRecipeKeeperCsv } from "@/lib/importRecipeKeeper";

const CSV_HEADER = `Name,Description,Ingredients,Directions,PrepTime,CookTime,Servings,Source,Categories`;

describe("parseRecipeKeeperCsv", () => {
  it("retourne tableau vide si CSV vide", () => {
    expect(parseRecipeKeeperCsv("")).toEqual([]);
  });

  it("retourne tableau vide si seulement l'en-tête", () => {
    expect(parseRecipeKeeperCsv(CSV_HEADER)).toEqual([]);
  });

  it("parse une recette simple", () => {
    const csv = `${CSV_HEADER}\n"Tarte citron","","200g farine\n100g beurre","Mélanger.","","","","Mon livre",""`;
    const result = parseRecipeKeeperCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Tarte citron");
    expect(result[0].source).toBe("Mon livre");
    expect(result[0].steps).toBe("Mélanger.");
  });

  it("parse les ingrédients avec quantité en grammes", () => {
    const csv = `${CSV_HEADER}\n"Financier","","200g farine\n150g beurre\n3 oeufs","","","","","",""`;
    const result = parseRecipeKeeperCsv(csv);
    const ings = result[0].ingredients;
    expect(ings.find((i) => i.name.toLowerCase().includes("farine"))?.quantityG).toBe(200);
    expect(ings.find((i) => i.name.toLowerCase().includes("beurre"))?.quantityG).toBe(150);
  });

  it("convertit kg en grammes", () => {
    const csv = `${CSV_HEADER}\n"Brioche","","1kg farine","","","","","",""`;
    const result = parseRecipeKeeperCsv(csv);
    expect(result[0].ingredients[0].quantityG).toBe(1000);
  });

  it("parse les catégories comme tags", () => {
    const csv = `${CSV_HEADER}\n"Macaron","","","","","","","","Pâtisserie,Français"`;
    const result = parseRecipeKeeperCsv(csv);
    expect(result[0].tags).toContain("Pâtisserie");
    expect(result[0].tags).toContain("Français");
  });

  it("ignore les lignes sans nom", () => {
    const csv = `${CSV_HEADER}\n"","","","","","","","",""\n"Recette valide","","","","","","","",""`;
    const result = parseRecipeKeeperCsv(csv);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Recette valide");
  });

  it("gère les guillemets échappés dans les cellules", () => {
    const csv = `${CSV_HEADER}\n"Gâteau ""spécial""","","","","","","","",""`;
    const result = parseRecipeKeeperCsv(csv);
    expect(result[0].name).toBe('Gâteau "spécial"');
  });

  it("gère plusieurs recettes", () => {
    const csv = [
      CSV_HEADER,
      `"Recette 1","","100g farine","Étape 1.","","","","",""`,
      `"Recette 2","","200g sucre","Étape 2.","","","","",""`,
    ].join("\n");
    const result = parseRecipeKeeperCsv(csv);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Recette 1");
    expect(result[1].name).toBe("Recette 2");
  });
});
