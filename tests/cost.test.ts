import { describe, it, expect } from "vitest";
import { costOf, formatEuro, lineCost, saleMargin } from "@/lib/cost";

describe("coût de revient", () => {
  it("prix au kg sur des grammes, des litres et des cuillères", () => {
    expect(lineCost({ name: "Beurre", quantityG: 250, unit: "g", cost: { price: 8, unit: "kg" } })).toBeCloseTo(2);
    expect(lineCost({ name: "Lait", quantityG: 0.5, unit: "L", cost: { price: 1.2, unit: "L" } })).toBeCloseTo(0.6);
    expect(lineCost({ name: "Vanille", quantityG: 2, unit: "cc", cost: { price: 100, unit: "kg" } })).toBeCloseTo(1);
  });

  it("prix à la pièce : en pièces, ou en grammes avec le poids d'une pièce", () => {
    expect(lineCost({ name: "Œuf", quantityG: 6, unit: "pièce", cost: { price: 0.3, unit: "pièce" } })).toBeCloseTo(1.8);
    expect(lineCost({ name: "Œuf", quantityG: 100, unit: "g", pieceG: 50, cost: { price: 0.3, unit: "pièce" } })).toBeCloseTo(0.6);
    expect(lineCost({ name: "Œuf", quantityG: 100, unit: "g", cost: { price: 0.3, unit: "pièce" } })).toBeNull();
  });

  it("prix au kg d'un ingrédient compté à la pièce : besoin du poids d'une pièce", () => {
    expect(lineCost({ name: "Œuf", quantityG: 4, unit: "pièce", pieceG: 50, cost: { price: 5, unit: "kg" } })).toBeCloseTo(1);
    expect(lineCost({ name: "Œuf", quantityG: 4, unit: "pièce", cost: { price: 5, unit: "kg" } })).toBeNull();
  });

  it("fourchette à la moyenne, QS gratuit, prix manquants listés", () => {
    const r = costOf([
      { name: "Sucre", quantityG: 100, quantityGMax: 200, unit: "g", cost: { price: 2, unit: "kg" } },
      { name: "Sel", quantityG: 0, unit: "QS" },
      { name: "Farine", quantityG: 300, unit: "g" },
    ]);
    expect(r.total).toBeCloseTo(0.3);
    expect(r.missing).toEqual(["Farine"]);
  });

  it("formatEuro", () => {
    expect(formatEuro(12.4)).toBe("12,40 €");
    expect(formatEuro(0.315)).toBe("0,315 €");
  });
});

describe("saleMargin", () => {
  it("retire la TVA avant de calculer la marge", () => {
    const m = saleMargin(2.11, 5.5, 0.5);
    expect(m.priceHT).toBeCloseTo(2, 2);
    expect(m.margin).toBeCloseTo(1.5, 2);
    expect(m.rate).toBeCloseTo(75, 0);
    expect(m.coef).toBeCloseTo(4.22, 2);
  });
  it("prix HT : rien n'est retiré", () => {
    const m = saleMargin(10, 0, 4);
    expect(m.margin).toBe(6);
    expect(m.rate).toBe(60);
  });
  it("marge négative quand le coût dépasse le prix", () => {
    expect(saleMargin(1, 0, 1.5).margin).toBe(-0.5);
  });
  it("sans coût, pas de coefficient", () => {
    expect(saleMargin(5, 5.5, 0).coef).toBeNull();
  });
});
