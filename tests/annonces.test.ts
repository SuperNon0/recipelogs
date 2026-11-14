import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAnnonces } from "@/lib/auth/passerelle";

const base = { url: "http://recipelog-passerelle:8000", key: "cle-maison" };
const fake = (status: number, body?: unknown) => async () => new Response(body === undefined ? null : JSON.stringify(body), { status });

describe("annonces de la plateforme (appli)", () => {
  it("lit la maintenance et les bandeaux", async () => {
    const r = await getAnnonces({
      ...base,
      fetch: fake(200, {
        maintenance: { message: "Mise à jour", fin: "2026-11-20T10:00:00.000Z" },
        bandeaux: [{ id: "b-1", niveau: "alerte", texte: "Attention" }, { pas: "un bandeau" }],
      }),
    });
    expect(r.maintenance).toEqual({ message: "Mise à jour", fin: "2026-11-20T10:00:00.000Z" });
    expect(r.bandeaux).toEqual([{ id: "b-1", niveau: "alerte", texte: "Attention" }]);
  });

  it("plateforme injoignable : rien n'est bloqué", async () => {
    const r = await getAnnonces({ ...base, fetch: async () => Promise.reject(new Error("down")) });
    expect(r).toEqual({ maintenance: null, bandeaux: [] });
  });
});

describe("annonces de la plateforme (passerelle)", () => {
  it("maintenance en cours, préavis et bandeaux selon le client", async () => {
    const dir = mkdtempSync(join(tmpdir(), "annonces-"));
    const t0 = Date.now();
    const h = (n: number) => new Date(t0 + n * 3600000).toISOString();
    writeFileSync(
      join(dir, "annonces.json"),
      JSON.stringify({
        maintenances: [
          { id: "a1", cibles: ["maison"], debut: h(-1), fin: h(1), message: "En cours" },
          { id: "a2", cibles: ["*"], debut: h(10), fin: h(11), message: "Bientôt", preavisHeures: 24 },
          { id: "a3", cibles: ["*"], debut: h(100), fin: null, message: "Plus tard", preavisHeures: 24 },
          { id: "a4", cibles: ["maison"], debut: h(-3), fin: h(-2), message: "Passée" },
        ],
        bandeaux: [
          { id: "b1", cibles: ["chanka"], texte: "Pour chanka" },
          { id: "b2", cibles: ["*"], texte: "Pour tous", jusqua: h(5) },
          { id: "b3", cibles: ["*"], texte: "Expiré", jusqua: h(-5) },
        ],
      }),
    );
    process.env.ANNONCES_DIR = dir;
    const { annoncesPour } = await import("../plateforme/passerelle/annonces.mjs");
    const maison = await annoncesPour("maison");
    expect(maison.maintenance).toEqual({ message: "En cours", fin: h(1) });
    expect(maison.bandeaux.map((b: { id: string }) => b.id)).toEqual(["m-a2", "b-b2"]);
    const chanka = await annoncesPour("chanka");
    expect(chanka.maintenance).toBeNull();
    expect(chanka.bandeaux.map((b: { id: string }) => b.id)).toEqual(["m-a2", "b-b1", "b-b2"]);
  });
});
