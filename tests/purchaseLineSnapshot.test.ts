import { describe, expect, it } from "vitest";
import { purchaseLineAmounts } from "@/lib/purchaseLineSnapshot";

describe("montants historiques des lignes de facture", () => {
  it("conserve le prix du colis de 5 kg même après un achat en colis de 10 kg", () => {
    const old = { quantity: 2, packSize: 5, packPrice: null, unitPrice: 4, lineTotal: null };
    expect(purchaseLineAmounts(old)).toEqual({ each: 20, amount: 40 });
    expect(purchaseLineAmounts({ ...old, packSize: 10 })).toEqual({ each: 40, amount: 80 });
    expect(purchaseLineAmounts(old)).toEqual({ each: 20, amount: 40 });
  });
  it("ne fabrique pas un prix de colis pour une ancienne ligne sans conditionnement", () => {
    expect(purchaseLineAmounts({ quantity: 2, packSize: null, packPrice: null, unitPrice: 4, lineTotal: null })).toEqual({ each: null, amount: null });
  });
  it("préserve les montants enregistrés et retrouve le prix colis depuis le total", () => {
    expect(purchaseLineAmounts({ quantity: 2, packSize: null, packPrice: null, unitPrice: 4, lineTotal: 40 })).toEqual({ each: 20, amount: 40 });
    expect(purchaseLineAmounts({ quantity: 2, packSize: 5, packPrice: 21, unitPrice: 4, lineTotal: 41 })).toEqual({ each: 21, amount: 41 });
  });
});
