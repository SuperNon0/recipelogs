import { describe, expect, it } from "vitest";
import { moldArea, moldCoef, moldLabel, moldsFilled, parseMold } from "@/lib/mold";

describe("moules", () => {
  it("cercle Ø18 → Ø24 : ×1,78 (rapport des surfaces)", () => {
    expect(moldCoef({ shape: "cercle", a: 18 }, { shape: "cercle", a: 24 })).toBeCloseTo(1.778, 3);
  });

  it("plusieurs moules d'arrivée multiplient le coefficient", () => {
    expect(moldCoef({ shape: "cercle", a: 16 }, { shape: "cercle", a: 16 }, 3)).toBeCloseTo(3, 6);
  });

  it("au volume quand les deux hauteurs sont connues", () => {
    expect(moldCoef({ shape: "cercle", a: 18, h: 4 }, { shape: "cercle", a: 18, h: 6 })).toBeCloseTo(1.5, 6);
    // Une seule hauteur : on reste à la surface.
    expect(moldCoef({ shape: "cercle", a: 18, h: 4 }, { shape: "cercle", a: 18 })).toBeCloseTo(1, 6);
  });

  it("un cadre 40×60 remplit environ 7,6 cercles Ø20", () => {
    expect(moldArea({ shape: "cadre", a: 40, b: 60 })).toBe(2400);
    expect(moldsFilled({ shape: "cadre", a: 40, b: 60 }, { shape: "cercle", a: 20 })).toBeCloseTo(7.64, 2);
  });

  it("libellés", () => {
    expect(moldLabel({ shape: "cercle", a: 18 })).toBe("Cercle Ø18");
    expect(moldLabel({ shape: "cadre", a: 40, b: 60, h: 4.5 })).toBe("Cadre 40×60 · h 4,5 cm");
    expect(moldLabel({ shape: "carre", a: 20 })).toBe("Carré 20");
  });

  it("lecture : complète ou rien", () => {
    expect(parseMold('{"shape":"cercle","a":"18"}')).toEqual({ shape: "cercle", a: 18 });
    expect(parseMold({ shape: "cadre", a: 40 })).toBeNull();
    expect(parseMold({ shape: "triangle", a: 4 })).toBeNull();
    expect(parseMold("")).toBeNull();
    expect(parseMold(null)).toBeNull();
  });
});
