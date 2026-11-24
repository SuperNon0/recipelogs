import { describe, expect, it } from "vitest";
import {
  articleExistant,
  doublonsProduits,
  fournisseurExistant,
  joliNom,
  produitProche,
  ressemblance,
  SEUIL_PROCHE,
} from "@/lib/ia/rapprochement";
import { nettoyerDocument } from "@/lib/ia/document";

const soframa = [
  { nom: "Crème liquide 35% MG 1 L Baignes UHT France", reference: "216" },
  { nom: "Crème lavante amande bidon 5 L", reference: "42952" },
  { nom: "Crème sucrée 32% MG 700 ml UHT Debic", reference: "27440" },
  { nom: "Praline amande 25% noisette 25% 5 kg", reference: null },
  { nom: "Jaune d'oeuf liquide 2 kg Atlantic Ovo bidon France", reference: null },
  { nom: "Chocolat noir 64% Manjari 3 kg", reference: null },
  { nom: "Farine T45 Gruau 25 kg", reference: null },
  { nom: "Fraise France cat I", reference: null },
];

describe("nom lisible", () => {
  it("met en minuscules un nom crié, garde les sigles et les pays", () => {
    expect(joliNom("CREME LIQUIDE 35%MG 1L BAIGNES UHT FRANCE")).toBe("Creme liquide 35%MG 1 L baignes UHT France");
    expect(joliNom("SUCRE SEMOULE 25KG")).toBe("Sucre semoule 25 kg");
    expect(joliNom("FARINE T55 GRUAU 25KG")).toBe("Farine T55 gruau 25 kg");
    expect(joliNom("SUCRE SEMOULE TAMISE 25KG FR")).toBe("Sucre semoule tamise 25 kg France");
    expect(joliNom("FRAISE ESPAGNE CAT I")).toBe("Fraise Espagne cat I");
  });
  it("ne touche pas un nom déjà écrit normalement", () => {
    expect(joliNom("Chocolat noir Guanaja 70% Valrhona")).toBe("Chocolat noir Guanaja 70% Valrhona");
    expect(joliNom("  Crème   UHT ")).toBe("Crème UHT");
  });
  it("s'applique aux lignes lues par l'IA", () => {
    const d = nettoyerDocument({ fournisseur: "RIBERA ET FILS", lignes: [{ produit: "TOMATE GRAPPE FRANCE", unite_prix: "kg", prix_unitaire: 3 }] });
    expect(d.lignes[0].produit).toBe("Tomate grappe France");
    expect(d.fournisseur).toBe("Ribera et fils");
  });
});

describe("retrouver le produit déjà enregistré", () => {
  it("par la référence", () => {
    expect(produitProche({ produit: "CREME LIQ 35 1L", reference: "216" }, soframa)?.produit.nom).toBe(soframa[0].nom);
  });
  it("par le nom, malgré majuscules, accents et abréviations", () => {
    const r = produitProche({ produit: "CREME LIQ.35%MG 1L BAIGNES UHT FR", reference: null }, soframa);
    expect(r?.produit.nom).toBe(soframa[0].nom);
    expect(r?.par).toBe("proche");
    expect(produitProche({ produit: "PRALINE AMANDE 25% NOIS 25% 5KG", reference: null }, soframa)?.produit.nom).toBe(soframa[3].nom);
    expect(produitProche({ produit: "JAUNE OEUF LIQ ATLANTIC OVO BIDON 2KG FR", reference: null }, soframa)?.produit.nom).toBe(soframa[4].nom);
    expect(produitProche({ produit: "fraise france cat i", reference: null }, soframa)?.par).toBe("nom");
  });
  it("ne confond pas ce qui change la recette ou le colis", () => {
    expect(produitProche({ produit: "CHOCOLAT NOIR 70% MANJARI 3KG", reference: null }, soframa)).toBeNull();
    expect(produitProche({ produit: "FARINE T55 GRUAU 25KG", reference: null }, soframa)).toBeNull();
    expect(produitProche({ produit: "FARINE T45 GRUAU 5KG", reference: null }, soframa)).toBeNull();
    expect(produitProche({ produit: "CREME LIQUIDE 30% MG 1L", reference: null }, soframa)).toBeNull();
  });
  it("garde séparées les variantes d'origine (elles se regroupent par l'article)", () => {
    expect(produitProche({ produit: "FRAISE ESPAGNE", reference: null }, soframa)).toBeNull();
  });
  it("une autre référence écarte le nom proche", () => {
    expect(produitProche({ produit: "Crème sucrée 32% MG 700 ml UHT", reference: "99999" }, soframa)).toBeNull();
    expect(produitProche({ produit: "Crème sucrée 32% MG 700 ml UHT", reference: "27440" }, soframa)?.par).toBe("reference");
  });
  it("préfère le produit écrit normalement à un ancien doublon en majuscules", () => {
    const avecDoublon = [{ nom: "CREME LIQ.35%MG 1L BAIGNES UHT FR", reference: null }, ...soframa];
    expect(produitProche({ produit: "Creme liq.35%MG 1 L baignes UHT France", reference: null }, avecDoublon)?.produit.nom).toBe(soframa[0].nom);
  });
  it("note de ressemblance", () => {
    expect(ressemblance("Crème liquide 35% 1 L", "CREME LIQ 35% 1L")).toBe(1);
    expect(ressemblance("Crème lavante 5 L", "Crème liquide 35% 1 L")).toBe(0);
    expect(ressemblance("Beurre doux 82% 10 kg", "Beurre tourage 84% 2 kg")).toBe(0);
    expect(ressemblance("Fraise France", "Framboise France")).toBeLessThan(SEUIL_PROCHE);
  });
});

describe("articles et fournisseurs", () => {
  const articles = ["Fraise", "Crème 35 %", "Chocolat noir 64 %", "Citron vert"];
  it("reprend l'orthographe de l'article déjà utilisé", () => {
    expect(articleExistant("Fraises", articles)).toBe("Fraise");
    expect(articleExistant("CRÈME 35%", articles)).toBe("Crème 35 %");
    expect(articleExistant("citrons verts", articles)).toBe("Citron vert");
    expect(articleExistant("Chocolat noir 70 %", articles)).toBeNull();
    expect(articleExistant("", articles)).toBeNull();
  });
  it("reconnaît le fournisseur", () => {
    const f = ["Ribera et Fils", "Soframa", "Coup de Pâtes"];
    expect(fournisseurExistant("RIBERA ET FILS SAS", f)).toBe("Ribera et Fils");
    expect(fournisseurExistant("SOFRAMA SARL", f)).toBe("Soframa");
    expect(fournisseurExistant("coup de pates", f)).toBe("Coup de Pâtes");
    expect(fournisseurExistant("Metro", f)).toBeNull();
  });
});

describe("doublons déjà créés", () => {
  it("propose de fusionner le produit en majuscules dans celui déjà écrit", () => {
    const produits = [
      { id: 48, name: "Crème liquide 35% MG 1 L Baignes UHT France", reference: "216", priceUnit: "L", lignes: 3 },
      { id: 230, name: "CREME LIQ.35%MG 1L BAIGNES UHT FR", reference: null, priceUnit: "L", lignes: 1 },
      { id: 31, name: "Praline amande 25% noisette 25% 5 kg", reference: null, priceUnit: "kg", lignes: 2 },
      { id: 231, name: "PRALINE AMANDE 25% NOIS 25% 5KG", reference: null, priceUnit: "kg", lignes: 1 },
      { id: 60, name: "Chocolat noir 64% 3 kg", reference: null, priceUnit: "kg", lignes: 1 },
      { id: 232, name: "CHOCOLAT NOIR 70% 3KG", reference: null, priceUnit: "kg", lignes: 1 },
      { id: 70, name: "Sucre semoule 25 kg", reference: null, priceUnit: "kg", lignes: 1 },
      { id: 233, name: "SUCRE SEMOULE 25KG", reference: null, priceUnit: "pièce", lignes: 1 },
    ];
    const d = doublonsProduits(produits);
    expect(d.map((g) => [g.garder.id, g.doublons.map((x) => x.id)])).toEqual([
      [48, [230]],
      [31, [231]],
    ]);
  });
});
