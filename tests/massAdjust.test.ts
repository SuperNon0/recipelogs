import { describe, it, expect } from "vitest";
import { recipeMass, scaleQty } from "@/lib/massAdjust";

describe("recipeMass", () => {
  it("compte g, cc (5 g), cs (15 g) et L (1000 g)", () => {
    const m = recipeMass([
      { quantityG: 100, unit: "g" },
      { quantityG: 2, unit: "cc" },
      { quantityG: 1, unit: "cs" },
      { quantityG: 0.5, unit: "L" },
    ]);
    expect(m.avg).toBe(100 + 10 + 15 + 500);
  });

  it("exclut pièce et QS", () => {
    expect(recipeMass([
      { quantityG: 3, unit: "pièce" },
      { quantityG: 0, unit: "QS" },
      { quantityG: 50, unit: "g" },
    ]).avg).toBe(50);
  });

  it("fourchettes : min, max et moyenne", () => {
    expect(recipeMass([{ quantityG: 100, quantityGMax: 200, unit: "g" }])).toEqual({ min: 100, max: 200, avg: 150 });
  });

  it("accepte des Decimal Prisma / chaînes", () => {
    expect(recipeMass([{ quantityG: "12.5", unit: "g" }]).avg).toBe(12.5);
  });
});

describe("scaleQty", () => {
  it("convertit L en g arrondi au supérieur", () => {
    expect(scaleQty(0.5, "L", 1)).toEqual({ quantityG: 500, unit: "g" });
  });
  it("conserve la valeur exacte à ×1 (pas d'arrondi au gramme)", () => {
    expect(scaleQty(9.7, "g", 1)).toEqual({ quantityG: 9.7, unit: "g" });
  });
  it("conserve les décimales d'un litre à ×1 (pas d'arrondi)", () => {
    expect(scaleQty(0.4005, "L", 1).quantityG).toBeCloseTo(400.5);
  });
  it("arrondit au gramme supérieur dès qu'on multiplie", () => {
    expect(scaleQty(9.7, "g", 2)).toEqual({ quantityG: 20, unit: "g" });
  });
});
