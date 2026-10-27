import { describe, expect, it } from "vitest";
import { findDurations, formatClock } from "@/lib/durations";

const secs = (t: string) => findDurations(t).map((d) => d.seconds);

describe("durées dans les étapes", () => {
  it("minutes, heures, secondes", () => {
    expect(secs("Cuire 18 min à 165 °C.")).toEqual([1080]);
    expect(secs("Laisser cristalliser 12 h.")).toEqual([43200]);
    expect(secs("Mixer 45 s puis 2 minutes.")).toEqual([45, 120]);
  });
  it("heures et minutes", () => {
    expect(secs("Refroidir 1 h 30 au froid.")).toEqual([5400]);
    expect(secs("Pousser 1h30.")).toEqual([5400]);
  });
  it("fourchette : le haut", () => {
    expect(secs("Cuire 10 à 12 min.")).toEqual([720]);
  });
  it("ignore ce qui n'est pas une durée", () => {
    expect(secs("Ajouter 3 sachets et 160 g de sucre.")).toEqual([]);
    expect(secs("Cuire 2 h 165 °C")).toEqual([7200]);
  });
  it("affichage", () => {
    expect(formatClock(1080)).toBe("18:00");
    expect(formatClock(5400)).toBe("1:30:00");
    expect(formatClock(44.2)).toBe("0:45");
  });
});
