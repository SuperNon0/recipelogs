import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

// Plateforme : l'appli confie ses PDF au service partagé (plateforme/pdf) quand
// RECIPELOG_PDF_URL est réglé, et les fait elle-même s'il ne répond pas.
let serveur: Server;
let recu: { client: string; corps: Record<string, unknown> } | null = null;
let reponse: { statut: number; corps: Buffer | string } = { statut: 200, corps: Buffer.from("%PDF-1.7 faux") };

beforeAll(async () => {
  serveur = createServer(async (req, res) => {
    let t = "";
    for await (const m of req) t += m;
    recu = { client: String(req.headers["x-recipelog-client"] ?? ""), corps: JSON.parse(t) };
    res.writeHead(reponse.statut, { "content-type": reponse.statut === 200 ? "application/pdf" : "application/json" });
    res.end(reponse.corps);
  });
  await new Promise<void>((ok) => serveur.listen(0, "127.0.0.1", ok));
  process.env.RECIPELOG_PDF_URL = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}/`;
  process.env.RECIPELOG_URL = "https://maison.recipelog.cc";
});
afterAll(() => serveur?.close());

describe("service PDF partagé", () => {
  it("envoie la page, le format, l'en-tête et le pied de page, et rend le PDF reçu", async () => {
    const { renderHtmlToPdf } = await import("@/lib/pdf/renderer");
    const pdf = await renderHtmlToPdf("<p>Tarte</p>", "A5", { footer: "Maison", showPageNumber: true });
    expect(Buffer.from(pdf).toString()).toBe("%PDF-1.7 faux");
    expect(recu!.client).toBe("maison");
    expect(recu!.corps).toMatchObject({ html: "<p>Tarte</p>", format: "A5", bandeaux: true });
    expect(String(recu!.corps.piedDePage)).toContain("pageNumber");
    expect(String(recu!.corps.piedDePage)).toContain("Maison");
  });

  it("une page refusée par le service donne son message, sans refaire le PDF sur place", async () => {
    reponse = { statut: 413, corps: JSON.stringify({ error: "Page trop lourde pour un PDF (40 Mo au plus)." }) };
    const { renderHtmlToPdf } = await import("@/lib/pdf/renderer");
    await expect(renderHtmlToPdf("<p>x</p>")).rejects.toThrow("trop lourde");
  });
});
