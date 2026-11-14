import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { consigne, lireJson, montantLigne, nettoyerDocument, nombre, prixALUnite } from "@/lib/ia/document";
import { lireAvecIA } from "@/lib/ia/appel";
import type { ReglagesIA } from "@/lib/ia/reglages";

describe("réponse de l'IA", () => {
  it("nettoie les lignes et les nombres", () => {
    const d = nettoyerDocument({
      fournisseur: " Ribera ",
      date: "14/11/2026",
      numero: "F123",
      total_ht: "125,50 €",
      remarque: null,
      lignes: [
        { produit: "Fraise Espagne cat I", reference: "FR1", article: "Fraise", famille: "Fruits et légumes", quantite: 2, contenance: 2.5, unite_prix: "kg", prix_unitaire: null, prix_colis: 12.5, montant_ligne: 25, a_verifier: null },
        { produit: "", unite_prix: "kg" },
        { produit: "Lait entier", unite_prix: "litre", prix_unitaire: "1,05" },
        { produit: "Boîte 20x8", unite_prix: "pièce", contenance: 50, prix_colis: 30 },
      ],
    });
    expect(d.fournisseur).toBe("Ribera");
    expect(d.date).toBe("2026-11-14");
    expect(d.total).toBe(125.5);
    expect(d.lignes).toHaveLength(3);
    expect(d.lignes[1]).toMatchObject({ produit: "Lait entier", unite: "L", prixUnitaire: 1.05 });
    expect(prixALUnite(d.lignes[0])).toBe(5);
    expect(prixALUnite(d.lignes[2])).toBe(0.6);
    expect(montantLigne(d.lignes[0])).toBe(25);
  });

  it("lit les nombres à la française", () => {
    expect(nombre("1.234,50")).toBe(1234.5);
    expect(nombre("1 234,5 €")).toBe(1234.5);
    expect(nombre("12.5")).toBe(12.5);
    expect(nombre("-3")).toBeNull();
    expect(nombre("abc")).toBeNull();
  });

  it("retrouve le JSON entouré de texte", () => {
    expect(lireJson('Voici :\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => lireJson("rien")).toThrow();
  });

  it("donne les articles existants dans la consigne", () => {
    const t = consigne("mercuriale", { articles: ["Fraise", "Crème 35 %"], fournisseur: "Choframa" });
    expect(t).toContain("Choframa");
    expect(t).toContain("Fraise ; Crème 35 %");
  });
});

// ─── Clé de la plateforme : appli → passerelle → (fausse) API Anthropic ───

const reponseClaude = {
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_reason: "end_turn",
  stop_sequence: null,
  content: [{ type: "text", text: JSON.stringify({ fournisseur: "Ribera", date: "2026-11-10", numero: "A1", total_ht: 10, remarque: null, lignes: [{ produit: "Citron vert", reference: null, article: "Citron vert", famille: null, quantite: 2, contenance: 1, unite_prix: "kg", prix_unitaire: 5, prix_colis: null, montant_ligne: 10, a_verifier: null }] }) }],
  usage: { input_tokens: 1200, output_tokens: 300 },
};

let amont: Server;
let relais: Server;
let dossier: string;
let recu: { headers: IncomingMessage["headers"]; corps: Record<string, unknown> } | null = null;
let urlRelais = "";

const ecouter = (s: Server) => new Promise<number>((ok) => s.listen(0, "127.0.0.1", () => ok((s.address() as AddressInfo).port)));

beforeAll(async () => {
  amont = createServer(async (req, res) => {
    let t = "";
    for await (const m of req) t += m;
    recu = { headers: req.headers, corps: JSON.parse(t) };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reponseClaude));
  });
  const pAmont = await ecouter(amont);
  dossier = mkdtempSync(join(tmpdir(), "ia-"));
  mkdirSync(join(dossier, "usage"));
  process.env.IA_DIR = dossier;
  process.env.IA_ANTHROPIC_CLE = "sk-ant-plateforme";
  process.env.IA_ANTHROPIC_URL = `http://127.0.0.1:${pAmont}`;
  process.env.IA_QUOTA_DEFAUT = "2";
  const ia = await import("../plateforme/passerelle/ia.mjs");
  relais = createServer((req, res) => {
    const url = new URL(req.url!, "http://x");
    if (url.pathname === "/v1/ia/anthropic/v1/messages") return void ia.relayer("maison", req, res, url.search);
    res.writeHead(404).end();
  });
  urlRelais = `http://127.0.0.1:${await ecouter(relais)}/v1/ia/anthropic`;
  process.env.RECIPELOG_PASSERELLE_URL = "http://passerelle";
  process.env.RECIPELOG_PASSERELLE_CLE = "cle-de-maison-assez-longue-pour-passer";
});

afterAll(() => {
  amont?.close();
  relais?.close();
});

const plateforme: ReglagesIA = { mode: "plateforme", fournisseur: "anthropic", cle: "", modele: "claude-opus-5-5" };
const fichier = { data: Buffer.from("%PDF-1.4 faux"), mime: "application/pdf", nom: "f.pdf" };

describe("lecture avec la clé de la plateforme", () => {
  it("passe par la passerelle, qui met sa clé et compte la lecture", async () => {
    const r = await lireAvecIA(plateforme, fichier, "facture", { articles: [] }, { anthropicBaseURL: urlRelais });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.lignes[0]).toMatchObject({ produit: "Citron vert", prixUnitaire: 5 });
    expect(recu!.headers["x-api-key"]).toBe("sk-ant-plateforme");
    expect(recu!.headers.authorization).toBeUndefined();
    expect(String(recu!.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(recu!.corps.model).toBe("claude-opus-5-5");
    const usage = JSON.parse(readFileSync(join(dossier, "usage", "maison.json"), "utf8"));
    expect(Object.values(usage)[0]).toEqual({ lectures: 1, entree: 1200, sortie: 300 });
  });

  it("refuse au-delà du quota du mois, avec un message pour le client", async () => {
    await lireAvecIA(plateforme, fichier, "facture", { articles: [] }, { anthropicBaseURL: urlRelais });
    const r = await lireAvecIA(plateforme, fichier, "facture", { articles: [] }, { anthropicBaseURL: urlRelais });
    expect(r).toMatchObject({ ok: false, code: "quota_ia" });
    if (!r.ok) expect(r.message).toContain("2 lectures");
  });

  it("le réglage du panel passe avant le défaut", async () => {
    writeFileSync(join(dossier, "reglages.json"), JSON.stringify({ defaut: 2, clients: { maison: 10 } }));
    const r = await lireAvecIA(plateforme, fichier, "facture", { articles: [] }, { anthropicBaseURL: urlRelais });
    expect(r.ok).toBe(true);
  });

  it("refuse une demande qui n'est pas une lecture", async () => {
    const { controler } = await import("../plateforme/passerelle/ia.mjs");
    const ok = { model: "claude-opus-5-5", max_tokens: 16000, messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] };
    expect(controler(ok, [])).toBeNull();
    expect(controler({ ...ok, model: "claude-fable-5-2" }, [])).toMatch(/modèle/);
    expect(controler({ ...ok, tools: [] }, [])).toMatch(/tools/);
    expect(controler({ ...ok, max_tokens: 64000 }, [])).toMatch(/max_tokens/);
    expect(controler(ok, ["files-api-2025-04-14"])).toMatch(/refusée/);
  });
});
