import { describe, expect, it } from "vitest";
import { ajouterMessageDemande, creerDemande, listerDemandes, marquerDemandeLue } from "@/lib/auth/passerelle";

type Call = { url: string; init: RequestInit };

function fake(status: number, body?: unknown, calls: Call[] = []) {
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(body === undefined ? null : JSON.stringify(body), { status });
    },
  };
}

const base = { url: "http://recipelog-passerelle:8000", key: "cle-chanka" };
const demande = {
  id: "20261114-101500-ab12",
  client: "chanka",
  date: "2026-11-14T10:15:00.000Z",
  maj: "2026-11-14T10:15:00.000Z",
  type: "bug",
  email: "chef@exemple.fr",
  statut: "ouvert",
  luSupport: false,
  luClient: true,
  contexte: { page: "/recipes/12" },
  messages: [{ de: "client", qui: "chef@exemple.fr", texte: "Le coût affiche 0 €", date: "2026-11-14T10:15:00.000Z" }],
};

describe("support par la passerelle", () => {
  it("crée une demande avec son contexte", async () => {
    const f = fake(201, { demande });
    const r = await creerDemande(
      { email: "chef@exemple.fr", type: "bug", message: "Le coût affiche 0 €", contexte: { page: "/recipes/12", version: "V2.18.154" } },
      { ...base, fetch: f.fetch },
    );
    expect(r.ok && r.demande?.id).toBe(demande.id);
    expect(f.calls[0].url).toBe("http://recipelog-passerelle:8000/v1/support");
    expect(JSON.parse(String(f.calls[0].init.body)).contexte.version).toBe("V2.18.154");
  });

  it("liste les demandes d'une adresse, sans les champs internes", async () => {
    const f = fake(200, { demandes: [demande, { pas: "une demande" }] });
    const r = await listerDemandes("Chef@Exemple.fr", { ...base, fetch: f.fetch });
    expect(f.calls[0].url).toBe("http://recipelog-passerelle:8000/v1/support?email=chef%40exemple.fr");
    expect(r.ok && r.demandes).toHaveLength(1);
    expect(r.ok && Object.keys(r.demandes[0])).not.toContain("luSupport");
  });

  it("répond et marque lu sur la bonne demande", async () => {
    const calls: Call[] = [];
    await ajouterMessageDemande(demande.id, "chef@exemple.fr", "Toujours pareil", { ...base, fetch: fake(200, { demande }, calls).fetch });
    await marquerDemandeLue(demande.id, "chef@exemple.fr", { ...base, fetch: fake(200, { demande }, calls).fetch });
    expect(calls.map((c) => c.url)).toEqual([
      `http://recipelog-passerelle:8000/v1/support/${demande.id}/messages`,
      `http://recipelog-passerelle:8000/v1/support/${demande.id}/lu`,
    ]);
  });

  it("trop de demandes : garde le message de la plateforme", async () => {
    const r = await creerDemande(
      { email: "a@b.fr", type: "question", message: "abc", contexte: {} },
      { ...base, fetch: fake(429, { error: "trop_de_demandes", message: "Trop de demandes aujourd'hui." }).fetch },
    );
    expect(r).toMatchObject({ ok: false, code: "trop_de_demandes", message: "Trop de demandes aujourd'hui." });
  });
});
