import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

// Gemini en continu par la passerelle : la réponse est transmise morceau par morceau,
// et la lecture est comptée dans le quota du client une fois finie.
const dossier = mkdtempSync(join(tmpdir(), "ia-gemini-"));
let amont: Server;
let passerelle: Server;
let adresse = "";
const recu: string[] = [];

beforeAll(async () => {
  amont = createServer((req, res) => {
    recu.push(req.url ?? "");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"lignes":' }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 5 } })}\r\n\r\n`);
    setTimeout(() => {
      res.end(`data: ${JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "[]}" }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 20, thoughtsTokenCount: 30 } })}\r\n\r\n`);
    }, 30);
  });
  await new Promise<void>((r) => amont.listen(0, "127.0.0.1", () => r()));
  process.env.IA_DIR = dossier;
  process.env.IA_GEMINI_URL = `http://127.0.0.1:${(amont.address() as AddressInfo).port}`;
  writeFileSync(join(dossier, "cle.json"), JSON.stringify({ fournisseur: "gemini", modele: "gemini-3.8-flash", cle: "AIza-cle-de-test", prix: { entree: 0.75, sortie: 3.75 } }));
  // @ts-expect-error : module JavaScript de la passerelle, sans types.
  const { relayerAutre } = await import("../plateforme/passerelle/ia.mjs");
  passerelle = createServer((req, res) => {
    const g = (req.url ?? "").match(/models\/([^:]+):(generateContent|streamGenerateContent)/);
    relayerAutre("maison", req, res, "gemini", g?.[1] ?? null, g?.[2] === "streamGenerateContent");
  });
  await new Promise<void>((r) => passerelle.listen(0, "127.0.0.1", () => r()));
  adresse = `http://127.0.0.1:${(passerelle.address() as AddressInfo).port}`;
});

afterAll(() => {
  amont?.close();
  passerelle?.close();
});

describe("passerelle : Gemini en continu", () => {
  it("transmet le flux, puis compte la lecture (pensée comprise)", async () => {
    const corps = { contents: [{ role: "user", parts: [{ inline_data: { mime_type: "application/pdf", data: "JVBERi0=" } }, { text: "Lis" }] }], generationConfig: { responseMimeType: "application/json", maxOutputTokens: 64000 } };
    const res = await fetch(`${adresse}/v1/ia/gemini/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse`, { method: "POST", body: JSON.stringify(corps) });
    expect(res.status).toBe(200);
    const texte = await res.text();
    expect(texte).toContain('"finishReason":"STOP"');
    expect(recu[0]).toBe("/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse");
    const usage = JSON.parse(readFileSync(join(dossier, "usage", "maison.json"), "utf8"));
    const mois = Object.values(usage)[0] as { lectures: number; entree: number; sortie: number };
    expect(mois).toMatchObject({ lectures: 1, entree: 1000, sortie: 50 });
  });

  it("refuse un autre modèle que celui du panel", async () => {
    const res = await fetch(`${adresse}/v1/ia/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`, { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });
});
