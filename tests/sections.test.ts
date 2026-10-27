import { describe, it, expect } from "vitest";
import { parseStepLines } from "@/lib/stepLines";
import { recipeMass } from "@/lib/massAdjust";
import { lineCost } from "@/lib/cost";

describe("intertitres", () => {
  it("étapes : # devient un intertitre non numéroté", () => {
    expect(parseStepLines("# Pâte\nSabler\n2. Fraser\n\n## Crème\nCuire")).toEqual([
      { kind: "title", text: "Pâte" },
      { kind: "step", text: "Sabler", no: 1 },
      { kind: "step", text: "Fraser", no: 2 },
      { kind: "title", text: "Crème" },
      { kind: "step", text: "Cuire", no: 3 },
    ]);
  });

  it("ingrédients : un intertitre ne pèse rien et ne coûte rien", () => {
    expect(recipeMass([{ quantityG: 0, unit: "titre" }, { quantityG: 200, unit: "g" }]).avg).toBe(200);
    expect(lineCost({ name: "Pâte", quantityG: 0, unit: "titre" })).toBe(0);
  });
});
