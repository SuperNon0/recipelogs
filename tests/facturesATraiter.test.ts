import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { getQuotaIA } from "@/lib/auth/passerelle";
import { limitesParDefaut, photosEnPdf, verifierPages } from "@/lib/pendingInvoices";

const base = { url: "http://recipelog-passerelle:8000", key: "cle" };
const fake = (body: unknown) => ({ ...base, fetch: async () => new Response(JSON.stringify(body), { status: 200 }) });

// Plus petites images valables : un PNG 1×1 et un JPG 1×1.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const JPG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAGAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDgqKKK8M/VD//Z",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");

describe("factures à traiter", () => {
  it("lit les limites envoyées par la passerelle (et les ignore si elles manquent)", async () => {
    const r = await getQuotaIA(fake({ disponible: true, limite: 30, utilise: 2, mois: "2026-11", factures: { attente: 12, pages: 4 } }));
    expect(r.ok && r.quota.factures).toEqual({ attente: 12, pages: 4 });
    const ancienne = await getQuotaIA(fake({ disponible: true, limite: 30, utilise: 2, mois: "2026-11" }));
    expect(ancienne.ok && ancienne.quota.factures).toBeNull();
    const bancale = await getQuotaIA(fake({ disponible: true, limite: 30, utilise: 0, mois: "2026-11", factures: { attente: -1, pages: "x" } }));
    expect(bancale.ok && bancale.quota.factures).toBeNull();
  });

  it("a des limites par défaut raisonnables", () => {
    const l = limitesParDefaut();
    expect(l.attente).toBeGreaterThan(0);
    expect(l.pages).toBeGreaterThanOrEqual(1);
    expect(l.pages).toBeLessThanOrEqual(20);
  });

  it("vérifie les pages envoyées", () => {
    const limites = { attente: 10, pages: 3 };
    expect(verifierPages([JPG, PNG], limites)).toEqual([".jpg", ".png"]);
    expect(verifierPages([PDF], limites)).toEqual([".pdf"]);
    expect(() => verifierPages([], limites)).toThrow(/au moins une photo/);
    expect(() => verifierPages([JPG, JPG, JPG, JPG], limites)).toThrow(/3 pages au plus/);
    expect(() => verifierPages([JPG, PDF], limites)).toThrow(/PDF s'envoie seul/);
    expect(() => verifierPages([Buffer.from("bonjour")], limites)).toThrow(/ni une photo/);
  });

  it("réunit plusieurs photos en un PDF, une page par photo", async () => {
    const pdf = await photosEnPdf([
      { bytes: JPG, type: "image/jpeg" },
      { bytes: PNG, type: "image/png" },
    ]);
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
  });
});
