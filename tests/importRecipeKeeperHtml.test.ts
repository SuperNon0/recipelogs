import { describe, it, expect } from "vitest";
import { parseRecipeKeeperHtml } from "../src/lib/importRecipeKeeperHtml";

const SAMPLE_HTML = `<!DOCTYPE html>
<html>
<head><style></style></head>
<body>
  <div class="recipe-details">
    <meta content="uuid-1" itemprop="recipeId">
    <meta content="True" itemprop="recipeIsFavourite">
    <meta content="4" itemprop="recipeRating">
    <table>
      <tr><td>
        <h2 itemprop="name">Tarte aux fraises</h2>
        <div>Plats: <span itemprop="recipeCourse">Dessert</span></div>
        <div>Catégories: <span>Tartes, Fruits</span>
          <meta content="Tartes" itemprop="recipeCategory">
          <meta content="Fruits" itemprop="recipeCategory">
        </div>
        <div>Les collections: <span>Sucrée</span>
          <meta content="Sucrée" itemprop="recipeCollection">
        </div>
        <div>Source: <span itemprop="recipeSource">Pierre Hermé</span></div>
        <div>Taille de portion: <span itemprop="recipeYield">1080g</span></div>
        <meta content="PT15M" itemprop="prepTime">
        <meta content="PT20M" itemprop="cookTime">
      </td>
      <td><img class="recipe-photo" src="images/abc_0.jpg"/></td>
      </tr>
      <tr>
        <td>
          <h3>Ingrédients</h3>
          <div class="recipe-ingredients" itemprop="recipeIngredients">
            <p>250g pâte sablée</p>
            <p>500g fraises</p>
            <p>Sucre glace</p>
            <p></p>
            <p>1080g Total</p>
          </div>
        </td>
        <td>
          <h3>Préparation</h3>
          <div itemprop="recipeDirections">
            <p>1.Étaler la pâte.</p>
            <p></p>
            <p>2.Cuire 15 min à 180°C.</p>
            <p></p>
            <p>3.Garnir et servir.</p>
          </div>
        </td>
      </tr>
    </table>
    <h3>Notes</h3>
    <div class="recipe-notes" itemprop="recipeNotes">
      <p>Préférer les gariguettes.</p>
      <p>Servir frais.</p>
    </div>
  </div>

  <div class="recipe-details">
    <meta content="uuid-2" itemprop="recipeId">
    <meta content="False" itemprop="recipeIsFavourite">
    <meta content="0" itemprop="recipeRating">
    <h2 itemprop="name">Recette sans étapes</h2>
    <div class="recipe-ingredients" itemprop="recipeIngredients">
      <p>100g sucre</p>
    </div>
    <div itemprop="recipeDirections"></div>
  </div>
</body>
</html>`;

describe("parseRecipeKeeperHtml", () => {
  const recipes = parseRecipeKeeperHtml(SAMPLE_HTML);

  it("détecte 2 recettes", () => {
    expect(recipes).toHaveLength(2);
  });

  it("extrait le nom", () => {
    expect(recipes[0].name).toBe("Tarte aux fraises");
    expect(recipes[1].name).toBe("Recette sans étapes");
  });

  it("extrait les métadonnées", () => {
    expect(recipes[0].source).toBe("Pierre Hermé");
    expect(recipes[0].portionSize).toBe("1080g");
    expect(recipes[0].rating).toBe(4);
    expect(recipes[0].favorite).toBe(true);
    expect(recipes[1].rating).toBe(null);
    expect(recipes[1].favorite).toBe(false);
  });

  it("merge recipeCourse et recipeCategory dans categories", () => {
    expect(recipes[0].categories).toEqual(["Dessert", "Tartes", "Fruits"]);
  });

  it("traite recipeCollection comme tags", () => {
    expect(recipes[0].tags).toEqual(["Sucrée"]);
  });

  it("filtre la ligne Total des ingrédients", () => {
    const ingNames = recipes[0].ingredients.map((i) => i.name);
    expect(ingNames).not.toContain("1080g Total");
  });

  it("parse les quantités en grammes quand possible", () => {
    const ings = recipes[0].ingredients;
    const pate = ings.find((i) => i.name.toLowerCase().includes("sablée"));
    expect(pate?.quantityG).toBe(250);
    const fraises = ings.find((i) => i.name.toLowerCase().includes("fraise"));
    expect(fraises?.quantityG).toBe(500);
  });

  it("strip les numéros en début d'étape", () => {
    expect(recipes[0].steps).toBeTruthy();
    expect(recipes[0].steps).toContain("Étaler la pâte.");
    expect(recipes[0].steps).toContain("Cuire 15 min à 180°C.");
    // Pas de "1." en tête
    expect(recipes[0].steps?.split("\n")[0]).toBe("Étaler la pâte.");
  });

  it("récupère les notes", () => {
    expect(recipes[0].notesTips).toContain("gariguettes");
    expect(recipes[0].notesTips).toContain("Servir frais");
  });

  it("récupère le chemin de la photo principale", () => {
    expect(recipes[0].images).toHaveLength(1);
    expect(recipes[0].images[0].path).toBe("images/abc_0.jpg");
  });

  it("ignore les recettes sans étapes proprement", () => {
    expect(recipes[1].steps).toBeNull();
  });
});
