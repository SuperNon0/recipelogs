import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiDenied: vi.fn(), visibleRecipeIds: vi.fn(), findFirst: vi.fn(), readFile: vi.fn(),
  findOrder: vi.fn(), readInvoiceFile: vi.fn(),
}));
vi.mock("@/lib/auth/guard", () => ({ apiDenied: mocks.apiDenied }));
vi.mock("@/lib/auth/visibility", () => ({ visibleRecipeIds: mocks.visibleRecipeIds }));
vi.mock("@/lib/prisma", () => ({ prisma: { recipe: { findFirst: mocks.findFirst }, purchaseOrder: { findUnique: mocks.findOrder } } }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@/lib/invoiceFiles", () => ({ readInvoiceFile: mocks.readInvoiceFile }));

import { GET } from "@/app/uploads/[...path]/route";
import { GET as invoiceGET } from "@/app/api/factures/[id]/fichier/route";

function request(path: string[]) {
  return GET(new Request("https://example.com/uploads/" + path.join("/")), { params: Promise.resolve({ path }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.apiDenied.mockResolvedValue(null);
  mocks.visibleRecipeIds.mockResolvedValue(null); // accès à toutes les recettes
  mocks.readFile.mockResolvedValue(Buffer.from("image"));
});

describe("autorisation des images d'upload", () => {
  it("refuse une requête sans accès en lecture", async () => {
    mocks.apiDenied.mockResolvedValue(new Response("Forbidden", { status: 403 }));
    expect((await request(["photo.jpg"])).status).toBe(403);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it.each(["jpg", "png", "webp", "pdf"])("ne sert jamais une facture %s par la route générique, même avec toutes les recettes", async (ext) => {
    expect((await request(["factures", `12-ab12cd34.${ext}`])).status).toBe(404);
    expect((await request(["FACTURES", `12-ab12cd34.${ext}`])).status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("refuse les alias de chemin vers une facture", async () => {
    expect((await request(["photos", "..", "factures", "12-ab12cd34.jpg"])).status).toBe(404);
    expect((await request(["photos/../factures", "12-ab12cd34.jpg"])).status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("refuse la route officielle sans permission financière", async () => {
    mocks.apiDenied.mockResolvedValue(new Response("Forbidden", { status: 403 }));
    const response = await invoiceGET(new Request("https://example.com/api/factures/12/fichier"), { params: Promise.resolve({ id: "12" }) });
    expect(response.status).toBe(403);
    expect(mocks.apiDenied).toHaveBeenCalledWith("costs.view");
    expect(mocks.findOrder).not.toHaveBeenCalled();
    expect(mocks.readInvoiceFile).not.toHaveBeenCalled();
  });

  it.each(["image/jpeg", "application/pdf"])("conserve l'accès autorisé aux factures %s par la route officielle", async (type) => {
    mocks.findOrder.mockResolvedValue({ filePath: "factures/12-test" });
    mocks.readInvoiceFile.mockResolvedValue({ bytes: Buffer.from("facture"), type });
    const response = await invoiceGET(new Request("https://example.com/api/factures/12/fichier"), { params: Promise.resolve({ id: "12" }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(type);
    expect(await response.text()).toBe("facture");
    expect(mocks.apiDenied).toHaveBeenCalledWith("costs.view");
  });

  it("sert une image de recette à un lecteur ayant accès à toutes les recettes", async () => {
    const response = await request(["photos", "tarte.jpg"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await response.text()).toBe("image");
  });

  it("ne sert à un rôle limité que les images de recettes visibles", async () => {
    mocks.visibleRecipeIds.mockResolvedValue(new Set([7]));
    mocks.findFirst.mockResolvedValue(null);
    expect((await request(["photos", "cachee.jpg"])).status).toBe(404);
    expect(mocks.readFile).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValue({ id: 7 });
    expect((await request(["photos", "visible.jpg"])).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenLastCalledWith({
      where: { id: { in: [7] }, photoPath: "/uploads/photos/visible.jpg" }, select: { id: true },
    });
  });
});
