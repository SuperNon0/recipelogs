import { describe, expect, it } from "vitest";
import { buyStats, dedupeBuys, perWeekLabel, toOrderUnit } from "@/lib/supplierOrders";

describe("moyenne commandée", () => {
  it("fait la moyenne par semaine sur 12 semaines", () => {
    const ev = [
      { date: "2026-11-20", quantity: 2, source: "facture" as const },
      { date: "2026-11-13", quantity: 3, source: "facture" as const },
      { date: "2026-10-01", quantity: 1, source: "facture" as const },
    ];
    const st = buyStats(ev, "2026-11-25", "2026-01-01")!;
    expect(st.weeks).toBe(12);
    expect(st.total).toBe(6);
    expect(st.perWeek).toBe(0.5);
    expect(st.times).toBe(3);
    expect(st.perDelivery).toBe(2);
    expect(st.last).toEqual({ date: "2026-11-20", quantity: 2 });
  });

  it("ne divise que par les semaines connues quand l'historique est court", () => {
    const ev = [{ date: "2026-11-20", quantity: 4, source: "facture" as const }];
    const st = buyStats(ev, "2026-11-25", "2026-11-12")!;
    expect(st.weeks).toBe(2);
    expect(st.perWeek).toBe(2);
  });

  it("ignore ce qui est plus vieux que 12 semaines", () => {
    expect(buyStats([{ date: "2026-06-01", quantity: 4, source: "facture" }], "2026-11-25", "2026-01-01")).toBeNull();
  });

  it("ne compte pas deux fois une commande suivie de sa facture", () => {
    const ev = [
      { date: "2026-11-17", quantity: 2, source: "commande" as const },
      { date: "2026-11-19", quantity: 2, source: "facture" as const },
      { date: "2026-11-24", quantity: 1, source: "commande" as const },
    ];
    expect(dedupeBuys(ev).map((e) => e.date)).toEqual(["2026-11-19", "2026-11-24"]);
  });

  it("ramène les kg à l'unité de commande", () => {
    const sac = { name: "Farine T45 sac 25 kg", packSize: 25, priceUnit: "kg" };
    expect(toOrderUnit(sac, 50, "kg")).toBe(2);
    expect(toOrderUnit(sac, 1, "sac")).toBe(1);
    expect(toOrderUnit(sac, 1, "pièce")).toBeNull();
  });

  it("écrit la moyenne simplement", () => {
    expect(perWeekLabel(1.7, "carton")).toBe("≈ 1,5 carton / semaine");
    expect(perWeekLabel(2.3, "carton")).toBe("≈ 2,5 cartons / semaine");
    expect(perWeekLabel(0.33, "sac")).toBe("≈ 0,3 sac / semaine");
  });
});
