import { describe, it, expect } from "vitest";
import { formatG, formatCoef, formatQty, formatRelativeDate } from "@/lib/format";

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

describe("formatQty", () => {
  it("grammes et kilos", () => {
    expect(formatQty(250, "g")).toBe("250 g");
    expect(formatQty(250, null)).toBe("250 g");
    expect(formatQty(1500, "g")).toContain("kg");
  });
  it("QS sans quantité", () => {
    expect(formatQty(0, "QS")).toBe("QS");
  });
  it("pluriel des pièces", () => {
    expect(formatQty(1, "pièce")).toBe("1 pièce");
    expect(formatQty(3, "pièce")).toBe("3 pièces");
  });
  it("autres unités avec décimales", () => {
    expect(formatQty(0.5, "L")).toBe("0,5 L");
    expect(formatQty(2, "cc")).toBe("2 cc");
  });
});

describe("formatRelativeDate", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it("parle en jours, semaines, mois puis années", () => {
    expect(formatRelativeDate(ago(0), now)).toBe("aujourd'hui");
    expect(formatRelativeDate(ago(1), now)).toBe("hier");
    expect(formatRelativeDate(ago(3), now)).toBe("il y a 3 j");
    expect(formatRelativeDate(ago(15), now)).toBe("2 sem.");
    expect(formatRelativeDate(ago(65), now)).toBe("2 mois");
    expect(formatRelativeDate(ago(800), now)).toBe("2 ans");
  });
  it("accepte une date en texte (ISO)", () => {
    expect(formatRelativeDate(ago(3).toISOString(), now)).toBe("il y a 3 j");
  });
});
