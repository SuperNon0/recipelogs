import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

// ChatGPT en continu par la passerelle (stream: true dans le corps) : la réponse est
// transmise morceau par morceau, et la lecture est comptée une fois finie.
const dossier = mkdtempSync(join(tmpdir(), "ia-openai-"));
let amont: Server;
let passerelle: Server;
let adresse = "";
const recu: Record<string, unknown>[] = [];

beforeAll(async () => {
  amont = createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      recu.push(JSON.parse(b));
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: "response.output_text.delta", delta: '{"lignes":' })}\n\n`);
      setTimeout(() => {
        res.end(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", usage: { input_tokens: 800, output_tokens: 40 } } })}\n\n`);
      }, 30);
    });
  });
  await new Promise<void>((r) => amont.listen(0, "127.0.0.1", () => r()));
  process.env.IA_DIR = dossier;
  process.env.IA_OPENAI_URL = `http://127.0.0.1:${(amont.address() as AddressInfo).port}`;
  writeFileSync(join(dossier, "cle.json"), JSON.stringify({ fournisseur: "openai", modele: "gpt-5-mini", cle: "sk-cle-de-test", prix: { entree: 0.25, sortie: 2 } }));
  const { relayerAutre } = await import("../plateforme/passerelle/ia.mjs");
  passerelle = createServer((req, res) => relayerAutre("maison", req, res, "openai"));
  await new Promise<void>((r) => passerelle.listen(0, "127.0.0.1", () => r()));
  adresse = `http://127.0.0.1:${(passerelle.address() as AddressInfo).port}`;
});

afterAll(() => {
  amont?.close();
  passerelle?.close();
});

const corps = (plus: Record<string, unknown> = {}) => ({
  model: "gpt-5-mini",
  input: [{ role: "user", content: [{ type: "input_file", filename: "f.pdf", file_data: "data:application/pdf;base64,JVBERi0=" }, { type: "input_text", text: "Lis" }] }],
  text: { format: { type: "json_schema", name: "document", schema: {}, strict: true } },
  ...plus,
});

describe("passerelle : ChatGPT en continu", () => {
  it("transmet le flux, puis compte la lecture", async () => {
    const res = await fetch(`${adresse}/v1/ia/openai/v1/responses`, { method: "POST", body: JSON.stringify(corps({ stream: true })) });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("response.completed");
    expect(recu[0].stream).toBe(true);
    const usage = JSON.parse(readFileSync(join(dossier, "usage", "maison.json"), "utf8"));
    const mois = Object.values(usage)[0] as { lectures: number; entree: number; sortie: number };
    expect(mois).toMatchObject({ lectures: 1, entree: 800, sortie: 40 });
  });

  it("refuse un « stream » qui n'est pas vrai ou faux", async () => {
    const res = await fetch(`${adresse}/v1/ia/openai/v1/responses`, { method: "POST", body: JSON.stringify(corps({ stream: "oui" })) });
    expect(res.status).toBe(400);
  });
});
