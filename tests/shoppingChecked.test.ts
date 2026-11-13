import { describe, expect, it } from "vitest";
import { checkedAfterRegeneration } from "@/lib/shoppingChecked";

const previous = (quantityG: number | null, checked = true, recipeId: number | null = 1) => [{ name: "Farine", unit: "g", quantityG, checked, recipeId }];
const next = (quantityG: number | null, unit = "g") => [{ name: "farine", unit, quantityG }];

describe("cases cochées après modification des courses", () => {
  it("décoche un besoin augmenté, y compris lors de l'ajout d'une recette", () => {
    expect([...checkedAfterRegeneration(previous(200), next(350))]).toEqual([]);
  });
  it.each([200, 150])("garde une quantité achetée suffisante pour %s g", (quantity) => {
    expect([...checkedAfterRegeneration(previous(200), next(quantity))]).toEqual(["farine|g"]);
  });
  it("ne coche ni un article neuf, ni un article déjà décoché", () => {
    expect([...checkedAfterRegeneration([], next(200))]).toEqual([]);
    expect([...checkedAfterRegeneration(previous(200, false), next(200))]).toEqual([]);
  });
  it("n'utilise pas une ligne manuelle ou une autre unité pour couvrir un besoin", () => {
    expect([...checkedAfterRegeneration(previous(200, true, null), next(200))]).toEqual([]);
    expect([...checkedAfterRegeneration(previous(200), next(200, "pièce"))]).toEqual([]);
  });
  it("garde QS coché mais décoche une conversion entre QS et quantité chiffrée", () => {
    expect([...checkedAfterRegeneration(previous(null), next(null))]).toEqual(["farine|g"]);
    expect([...checkedAfterRegeneration(previous(null), next(100))]).toEqual([]);
    expect([...checkedAfterRegeneration(previous(100), next(null))]).toEqual([]);
  });
});
