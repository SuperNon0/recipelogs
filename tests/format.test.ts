import { describe, it, expect } from "vitest";
import { formatG, formatCoef } from "@/lib/format";

describe("formatG", () => {
  it("affiche les grammes < 1000 avec une décimale", () => {
    expect(formatG(500)).toContain("500");
    expect(formatG(0.5)).toMatch(/0[,.]5/);
  });
  it("affiche en kg au-delà de 1000g", () => {
    expect(formatG(1000)).toContain("1");
    expect(formatG(1000)).toContain("kg");
    expect(formatG(1500)).toContain("1");
    expect(formatG(1500)).toContain("kg");
  });
  it("affiche 0g pour zéro", () => {
    expect(formatG(0)).toContain("0");
  });
});

describe("formatCoef", () => {
  it("préfixe avec ×", () => {
    expect(formatCoef(2)).toBe("×2");
    expect(formatCoef(1.5)).toMatch(/×1[,.]5/);
  });
  it("gère 1 (neutre)", () => {
    expect(formatCoef(1)).toBe("×1");
  });
});
