import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Faux BotPanel : répond 200, ou 404 pour un slug inconnu (comme le vrai /api/notify).
const recus: { id: string; vars: Record<string, string> }[] = [];
let serveur: Server;
let adresse = "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let n: any;

beforeAll(async () => {
  process.env.DONNEES = mkdtempSync(join(tmpdir(), "notifs-"));
  serveur = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      const j = JSON.parse(b);
      recus.push(j);
      res.writeHead(j.id === "inconnu" ? 404 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "sent" }));
    });
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", () => ok()));
  const a = serveur.address();
  adresse = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
  n = await import("../plateforme/panel/notifications.mjs");
});
afterAll(() => serveur.close());

describe("notifications du panel (Discord par BotPanel + cloche)", () => {
  it("sans adresse de BotPanel : gardée dans le panel, rien sur Discord", async () => {
    const r = await n.notifier("panne", "🔴 maison ne répond plus", "Depuis 2 minutes.");
    expect(r.canaux).toEqual({ discord: null, panel: true });
    expect(recus).toHaveLength(0);
  });

  it("envoie à BotPanel avec le slug du type et les variables", async () => {
    await n.regler({ botpanel: `${adresse}/` });
    const r = await n.notifier("support", "📩 Nouvelle demande de maison", "chef@maison.fr : bonjour");
    expect(r.canaux.discord).toBe(true);
    expect(recus.at(-1)).toMatchObject({ id: "recipelog_support", vars: { titre: "📩 Nouvelle demande de maison", texte: "chef@maison.fr : bonjour", type: "support" } });
  });

  it("envoie les infos rangées et le retour à la normale sur <slug>_ok", async () => {
    await n.notifier("panne", "✅ maison est revenu", "Panne de 3 min.", { niveau: "ok", champs: { qui: "maison", duree: "3 min", vide: "", "Pas-bon": "x" } });
    expect(recus.at(-1)).toMatchObject({ id: "recipelog_panne_ok", vars: { qui: "maison", duree: "3 min", vide: "—", titre: "✅ maison est revenu" } });
    expect(recus.at(-1)?.vars).not.toHaveProperty("Pas-bon");
    expect((await n.resume()).liste[0].niveau).toBe("ok");
  });

  it("respecte les cases Discord / Panel et dit pourquoi BotPanel a refusé", async () => {
    await n.regler({ types: { disque: { discord: false }, demo: { panel: false }, maj: { slug: "inconnu" } } });
    const avant = recus.length;
    expect((await n.notifier("disque", "t", "x")).canaux).toEqual({ discord: null, panel: true });
    expect(recus.length).toBe(avant);
    expect((await n.notifier("demo", "t", "x")).canaux).toEqual({ discord: true, panel: null });
    const refus = await n.notifier("maj", "t", "x");
    expect(refus.canaux.discord).toContain("inconnu");
  });

  it("refuse une mauvaise adresse, un type ou un nom inconnu", async () => {
    await expect(n.regler({ botpanel: "ftp://x" })).rejects.toThrow(/Adresse/);
    await expect(n.regler({ types: { zz: {} } })).rejects.toThrow(/inconnu/);
    await expect(n.regler({ types: { panne: { slug: "Pas Bon!" } } })).rejects.toThrow(/invalide/);
  });

  it("lu / non lu, tout marquer, vider", async () => {
    let s = await n.resume();
    const nonLues = s.nonLues;
    expect(nonLues).toBeGreaterThan(1);
    expect(s.liste[0].titre).toBe("t"); // la plus récente en haut
    s = await n.marquer({ ids: [s.liste[0].id] });
    expect(s.nonLues).toBe(nonLues - 1);
    s = await n.marquer({ tout: true });
    expect(s.nonLues).toBe(0);
    await n.notifier("panne", "nouvelle", "x");
    expect((await n.resume()).nonLues).toBe(1);
    s = await n.vider();
    expect(s.total).toBe(0);
  });
});
