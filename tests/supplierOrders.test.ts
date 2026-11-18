import { describe, expect, it } from "vitest";
import { orderText, orderUnits, packNameOf, qtyLabel, suggestGroups, unitEstimate } from "@/lib/supplierOrders";

describe("conditionnement commandé", () => {
  it("prend le conditionnement réglé", () => {
    expect(packNameOf({ name: "Croissant 70 g", packName: "carton", packSize: 120, priceUnit: "pièce" })).toBe("carton");
  });
  it("le lit dans la désignation", () => {
    expect(packNameOf({ name: "Farine T45 sac 25 kg", packSize: 25, priceUnit: "kg" })).toBe("sac");
    expect(packNameOf({ name: "Crème 35% bidon 5 L", packSize: 5, priceUnit: "L" })).toBe("bidon");
    expect(packNameOf({ name: "Boîte pâtissière 20 × 8", priceUnit: "pièce" })).toBe("boîte");
  });
  it("sinon colis, carton (pièces) ou l'unité du prix", () => {
    expect(packNameOf({ name: "Beurre AOP", packSize: 10, priceUnit: "kg" })).toBe("colis");
    expect(packNameOf({ name: "Pain au chocolat", packSize: 80, priceUnit: "pièce" })).toBe("carton");
    expect(packNameOf({ name: "Fraise", priceUnit: "kg" })).toBe("kg");
  });
  it("propose aussi l'unité du prix", () => {
    expect(orderUnits({ name: "Farine sac 25 kg", packSize: 25, priceUnit: "kg" })).toEqual(["sac", "kg"]);
    expect(orderUnits({ name: "Fraise", priceUnit: "kg" })).toEqual(["kg"]);
  });
  it("estime le prix d'une unité commandée", () => {
    const p = { name: "Farine sac 25 kg", packSize: 25, priceUnit: "kg", price: 0.9 };
    expect(unitEstimate(p, "sac")).toBeCloseTo(22.5);
    expect(unitEstimate(p, "kg")).toBe(0.9);
    expect(unitEstimate({ ...p, price: null }, "sac")).toBeNull();
  });
});

describe("texte pour le commercial", () => {
  it("accorde les quantités", () => {
    expect(qtyLabel(1, "carton")).toBe("1 carton");
    expect(qtyLabel(2, "carton")).toBe("2 cartons");
    expect(qtyLabel(3, "seau")).toBe("3 seaux");
    expect(qtyLabel(2, "kg")).toBe("2 kg");
    expect(qtyLabel(2, "colis")).toBe("2 colis");
    expect(qtyLabel(1.5, "kg")).toBe("1,5 kg");
  });
  it("écrit le message", () => {
    const t = orderText({
      supplier: "Metro",
      signature: "Maison Chanka",
      deliveryDate: "2026-11-20",
      note: "Livrer avant 7 h",
      lines: [
        { label: "Croissant pur beurre", reference: "123", quantity: 2, unit: "carton" },
        { label: "Farine T45", quantity: 1, unit: "sac" },
      ],
    });
    expect(t).toContain("Voici ma commande, à livrer le vendredi 20 novembre :");
    expect(t.endsWith("Merci !\nMaison Chanka")).toBe(true);
    expect(t).toContain("- 2 cartons : Croissant pur beurre (réf. 123)");
    expect(t).toContain("- 1 sac : Farine T45");
    expect(t).toContain("Livrer avant 7 h");
  });
  it("ne signe pas sans signature", () => {
    const t = orderText({ supplier: "Metro", lines: [{ label: "Beurre", quantity: 1, unit: "carton" }] });
    expect(t).toContain("Voici ma commande :");
    expect(t.endsWith("Merci !")).toBe(true);
  });
});

describe("regroupements proposés", () => {
  it("réunit les produits qui commencent par le même mot", () => {
    const g = suggestGroups([
      { id: 1, name: "Croissant pur beurre 70 g" },
      { id: 2, name: "Croissant margarine" },
      { id: 3, name: "Croissants beurre 60 g" },
      { id: 4, name: "Pain au chocolat" },
      { id: 5, name: "Sac farine T45" },
      { id: 6, name: "Sac farine T55" },
      { id: 7, name: "Croissant amande", article: "Croissant amande" },
    ]);
    expect(g.map((x) => x.article)).toEqual(["Croissant"]);
    expect(g[0].products.map((p) => p.id).sort()).toEqual([1, 2, 3]);
  });
  it("ne propose pas de mélanger des % ou des types de farine différents", () => {
    expect(suggestGroups([{ id: 1, name: "Chocolat noir 64 %" }, { id: 2, name: "Chocolat lait 35 %" }])).toEqual([]);
    expect(suggestGroups([{ id: 1, name: "Farine T45" }, { id: 2, name: "Farine T55" }])).toEqual([]);
    expect(suggestGroups([{ id: 1, name: "Sucre semoule" }, { id: 2, name: "Sucre glace" }])).toHaveLength(1);
  });
});
