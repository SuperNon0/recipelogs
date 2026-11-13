import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { purchaseOrder: { findUnique: db.findUnique } } }));
import { loadPurchaseOrder } from "@/lib/purchaseOrders";

describe("lecture d'une ancienne facture après changement de conditionnement du produit", () => {
  const invoice = (packSize: number | null, productSize: number) => ({
    id: 1, date: new Date("2026-01-01"), number: "F1", total: 40,
    note: null, filePath: null, createdAt: new Date("2026-01-01"), supplier: { id: 1, name: "Fournisseur" },
    lines: [{ id: 1, quantity: 2, packSize, packPrice: null, unitPrice: 4, priceUnit: "kg", lineTotal: null,
      product: { id: 1, name: "Sucre", packSize: productSize, priceUnit: "kg", base: null } }],
  });
  beforeEach(() => vi.clearAllMocks());
  it("ignore le nouveau colis du produit et conserve les 40 € historiques", async () => {
    db.findUnique.mockResolvedValue(invoice(5, 10));
    const old = await loadPurchaseOrder(1);
    expect(old?.lines[0]).toMatchObject({ each: 20, amount: 40, packLabel: "colis de 5 kg" });
  });
  it("signale un ancien conditionnement inconnu au lieu de copier le conditionnement actuel", async () => {
    db.findUnique.mockResolvedValue(invoice(null, 10));
    const old = await loadPurchaseOrder(1);
    expect(old?.lines[0]).toMatchObject({ each: null, amount: null, packLabel: "conditionnement historique inconnu" });
  });
});
