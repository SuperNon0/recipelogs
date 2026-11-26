import { describe, expect, it } from "vitest";
import { aujourdHui, joursEnTexte, parseJours, prochaineLivraison, quandLivre, rappelsDuJour, serialiseJours } from "@/lib/orderDays";
import { contactsDepuisJson, nettoieContacts, telLien } from "@/lib/supplierContacts";

describe("jours de commande", () => {
  it("lit et écrit les jours", () => {
    expect(parseJours("5,1,3,3,9")).toEqual([1, 3, 5]);
    expect(parseJours(null)).toEqual([]);
    expect(serialiseJours([5, 1, 3])).toBe("1,3,5");
    expect(serialiseJours(["lundi", "Mer", "vendredi"])).toBe("1,3,5");
    expect(serialiseJours([])).toBeNull();
  });

  it("dit les jours en français", () => {
    expect(joursEnTexte([1, 3, 5])).toBe("lundi, mercredi et vendredi");
    expect(joursEnTexte([2])).toBe("le mardi");
    expect(joursEnTexte([1, 2, 3, 4, 5, 6])).toBe("tous les jours sauf le dimanche");
    expect(joursEnTexte([1, 2, 3, 4, 5, 6, 7])).toBe("tous les jours");
  });

  it("compte le jour à l'heure française", () => {
    // Jeudi 26/11/2026 à 23 h 30 UTC = vendredi 0 h 30 à Paris.
    expect(aujourdHui(new Date("2026-11-26T23:30:00Z"))).toEqual({ jour: 5, date: "2026-11-27" });
    expect(aujourdHui(new Date("2026-11-26T12:00:00Z"))).toEqual({ jour: 4, date: "2026-11-26" });
  });

  it("trouve la livraison qui suit", () => {
    expect(prochaineLivraison(1, [2, 4, 6])).toEqual({ jour: 2, dans: 1 });
    expect(prochaineLivraison(6, [2, 4, 6])).toEqual({ jour: 2, dans: 3 });
    expect(quandLivre({ jour: 2, dans: 1 })).toBe("demain");
    expect(quandLivre({ jour: 2, dans: 3 })).toBe("mardi");
    expect(prochaineLivraison(1, [])).toBeNull();
  });

  it("liste les fournisseurs à commander, ceux déjà commandés à la fin", () => {
    const f = [
      { id: 1, name: "France Frais", orderDays: "1,3,5", deliveryDays: "2,4,6" },
      { id: 2, name: "Coup de Pâtes", orderDays: "1,3,5", deliveryDays: "2,4,6" },
      { id: 3, name: "Soframa", orderDays: "1,2,3,4,5,6", deliveryDays: null },
      { id: 4, name: "Metro", orderDays: "2", deliveryDays: null },
    ];
    const r = rappelsDuJour(f, [2], 5);
    expect(r.map((x) => [x.name, x.livraison, x.commandee])).toEqual([
      ["France Frais", "demain", false],
      ["Soframa", null, false],
      ["Coup de Pâtes", "demain", true],
    ]);
  });
});

describe("numéros à appeler", () => {
  it("garde les numéros, enlève les lignes vides", () => {
    expect(nettoieContacts([{ nom: " Commercial ", tel: "06 12 34 56 78" }, { nom: "x", tel: "" }])).toEqual([{ nom: "Commercial", tel: "06 12 34 56 78" }]);
    expect(() => nettoieContacts([{ tel: "pas un numéro" }])).toThrow();
    expect(telLien("+33 6 12 34 56 78")).toBe("+33612345678");
    expect(telLien("04.66.51.60.06")).toBe("0466516006");
    expect(contactsDepuisJson([{ nom: "A", tel: "0466" }, "x", { tel: "" }])).toEqual([{ nom: "A", tel: "0466" }]);
    expect(contactsDepuisJson(null)).toEqual([]);
  });
});
