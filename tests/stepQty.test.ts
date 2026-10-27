import { describe, it, expect } from "vitest";
import { hasStepQty, scaleStepParts } from "@/lib/stepQty";

const flat = (parts: ReturnType<typeof scaleStepParts>) => parts.map((p) => (typeof p === "string" ? p : `[${p.qty}]`)).join("");

describe("quantités liées dans les étapes", () => {
  it("à ×1, la quantité s'affiche telle quelle, sans accolades", () => {
    expect(flat(scaleStepParts("Verser {167 g} de lait"))).toBe("Verser [167 g] de lait");
    expect(flat(scaleStepParts("{9,5g} de gélatine"))).toBe("[9,5 g] de gélatine");
  });

  it("suit le multiplicateur, arrondi au gramme supérieur", () => {
    expect(flat(scaleStepParts("Verser {167 g}", 1.5))).toBe("Verser [251 g]");
    expect(flat(scaleStepParts("{1,2 kg} de farine", 1.5))).toBe("[1,8 kg] de farine");
    expect(flat(scaleStepParts("Ajouter {3 pièces}", 1.5))).toBe("Ajouter [5 pièces]");
    expect(flat(scaleStepParts("{1 l}", 2))).toBe("[2 L]");
  });

  it("option Entiers à ×1 : arrondi au gramme supérieur", () => {
    expect(flat(scaleStepParts("{9,5 g}", 1, true))).toBe("[10 g]");
  });

  it("le reste du texte n'est pas touché", () => {
    expect(flat(scaleStepParts("Cuire 20 min à 180 °C", 2))).toBe("Cuire 20 min à 180 °C");
    expect(hasStepQty("Cuire 20 min")).toBe(false);
    expect(hasStepQty("Verser {100 g}")).toBe(true);
  });
});
