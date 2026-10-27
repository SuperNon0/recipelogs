import { describe, it, expect } from "vitest";
import { costOf, formatEuro, lineCost } from "@/lib/cost";

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
