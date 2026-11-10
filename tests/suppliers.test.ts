import { describe, expect, it } from "vitest";
import { articleKey, bestPrice, buildComparison, packLabel, packagingWarning, priceStats, readPackaging, unitPriceOf, type ComparisonProduct } from "@/lib/suppliers";

describe("unitPriceOf", () => {
  it("garde le prix unitaire donné", () => {
    expect(unitPriceOf({ unitPrice: 18.4, packPrice: 99 })).toBe(18.4);
  });
  it("divise le prix d'un colis par sa contenance", () => {
    expect(unitPriceOf({ packPrice: 55.2, packSize: 3 })).toBe(18.4);
    expect(unitPriceOf({ packPrice: 16.5, packSize: 50 })).toBe(0.33);
  });
  it("part du montant de la ligne", () => {
    expect(unitPriceOf({ lineTotal: 110.4, quantity: 2, packSize: 3 })).toBe(18.4);
    expect(unitPriceOf({ lineTotal: 8.7, quantity: 2 })).toBe(4.35);
  });
  it("renvoie null sans prix", () => {
    expect(unitPriceOf({ quantity: 2 })).toBeNull();
    expect(unitPriceOf({ unitPrice: 0 })).toBeNull();
  });
});

describe("priceStats", () => {
  const h = [
    { date: "2026-09-12", price: 15.05, unit: "kg" },
    { date: "2026-11-10", price: 15.95, unit: "kg" },
    { date: "2026-10-01", price: 15.2, unit: "kg" },
  ];
  it("prend la facture la plus récente, la précédente et la moyenne", () => {
    const s = priceStats(h)!;
    expect(s.current).toBe(15.95);
    expect(s.previous).toBe(15.2);
    expect(s.changePct).toBe(5);
    expect(s.average).toBeCloseTo(15.4, 4);
    expect(s.count).toBe(3);
    expect(s.date).toBe("2026-11-10");
  });
  it("ignore les prix dans une autre unité", () => {
    const s = priceStats([...h, { date: "2026-11-11", price: 2, unit: "pièce" }])!;
    expect(s.unit).toBe("pièce");
    expect(s.previous).toBeNull();
    expect(s.count).toBe(1);
  });
  it("vide : null", () => {
    expect(priceStats([])).toBeNull();
  });
});

describe("buildComparison", () => {
  const p = (id: number, supplierId: number, article: string, price: number, family: string | null = "Chocolat", unit = "kg"): ComparisonProduct => ({
    id,
    supplierId,
    name: `${article} (${supplierId})`,
    article,
    family,
    packLabel: null,
    unit,
    stats: priceStats([{ date: "2026-11-10", price, unit }]),
  });

  it("regroupe le même article chez plusieurs fournisseurs", () => {
    const rows = buildComparison([p(1, 1, "Chocolat noir 64 %", 14.2), p(2, 2, "chocolat noir 64 %", 15.95), p(3, 1, "Crème 35 %", 4, "Crèmerie et œufs", "L")]);
    expect(rows).toHaveLength(2);
    const choc = rows.find((r) => r.article.startsWith("Chocolat"))!;
    expect(Object.keys(choc.cells)).toEqual(["1", "2"]);
    expect(bestPrice(choc, [1, 2])).toBe(14.2);
    expect(bestPrice(choc, [2, 3])).toBeNull();
  });

  it("range par famille dans l'ordre conseillé, « Autres » à la fin", () => {
    const rows = buildComparison([p(1, 1, "Poche", 0.1, null, "pièce"), p(2, 1, "Lait", 1, "Crèmerie et œufs", "L"), p(3, 1, "Guanaja", 18)]);
    expect(rows.map((r) => r.family)).toEqual(["Chocolat", "Crèmerie et œufs", "Autres"]);
  });

  it("chez un même fournisseur, garde le moins cher", () => {
    const rows = buildComparison([p(1, 1, "Sucre", 1.2), p(2, 1, "Sucre", 1.1)]);
    expect(rows[0].cells[1].productId).toBe(2);
  });

  it("ne compare pas deux unités différentes", () => {
    expect(buildComparison([p(1, 1, "Oeufs", 0.3, null, "pièce"), p(2, 2, "Œufs", 4, null, "kg")])).toHaveLength(2);
  });
});

describe("petits utilitaires", () => {
  it("articleKey ignore casse, accents et œ", () => {
    expect(articleKey("  Œufs  Plein   air ")).toBe(articleKey("oeufs plein air"));
    expect(articleKey("Crème")).toBe("creme");
  });
  it("packLabel", () => {
    expect(packLabel(25, "kg")).toBe("colis de 25 kg");
    expect(packLabel(50, "pièce")).toBe("colis de 50");
    expect(packLabel(1, "kg")).toBeNull();
  });
});

describe("readPackaging / packagingWarning", () => {
  it("prend le poids net égoutté d'une boîte de conserve", () => {
    expect(readPackaging("Abricot oreillon sirop 5/1 boîte 4,2 kg PNE 2,4 kg Brover").amount).toEqual({ value: 2.4, unit: "kg", drained: true });
  });
  it("lit ml, g, x N", () => {
    expect(readPackaging("Crème sucrée 32% MG 700 ml UHT").amount).toEqual({ value: 0.7, unit: "L", drained: false });
    expect(readPackaging("Levure pressée 500 g x 5").amount?.value).toBe(0.5);
    expect(readPackaging("Boîte pâtissière Rendez-Vous 16 x 8 x 50").count).toBe(50);
    expect(readPackaging("Carré raine 17 cm x 250").count).toBe(250);
    expect(readPackaging("Poche pâtissière 30 x 54 cm x 100").count).toBe(100);
    expect(readPackaging("Minuteur 20 heures")).toEqual({ amount: null, count: null });
  });
  it("prévient pour une boîte à la pièce, pas pour un prix au kg ou un colis donné", () => {
    expect(packagingWarning({ product: "Demi poire Williams sirop boîte 5/1 4,25 kg PNE 2,3 kg", unit: "pièce" })).toMatch(/2,3 kg/);
    expect(packagingWarning({ product: "Carré raine 17 cm x 250", unit: "pièce" })).toMatch(/contenance = 250/);
    expect(packagingWarning({ product: "Carré raine 17 cm x 250", unit: "pièce", packSize: 250 })).toBeNull();
    expect(packagingWarning({ product: "Chocolat noir 5 kg", unit: "kg" })).toBeNull();
    expect(packagingWarning({ product: "Minuteur 20 heures", unit: "pièce" })).toBeNull();
    expect(packagingWarning({ product: "Fuze Tea pêche 33 cl canette", unit: "pièce" })).toBeNull();
  });
});
