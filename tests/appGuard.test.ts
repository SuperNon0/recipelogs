import { describe, expect, it } from "vitest";
import { doitRecharger, estErreurDeVersion } from "@/lib/appGuard";

describe("estErreurDeVersion", () => {
  it("reconnaît les erreurs d'une page ouverte avant une mise à jour", () => {
    expect(estErreurDeVersion(Object.assign(new Error("x"), { name: "ChunkLoadError" }))).toBe(true);
    expect(estErreurDeVersion(new Error("Loading chunk 4521 failed."))).toBe(true);
    expect(estErreurDeVersion(new Error("Loading CSS chunk app-layout failed"))).toBe(true);
    expect(estErreurDeVersion("TypeError: Importing a module script failed.")).toBe(true);
    expect(estErreurDeVersion(new Error('Failed to find Server Action "abc". This request might be from an older or newer deployment.'))).toBe(true);
    expect(estErreurDeVersion(new Error("An unexpected response was received from the server."))).toBe(true);
  });

  it("laisse passer les autres erreurs", () => {
    expect(estErreurDeVersion(new Error("Permission refusée"))).toBe(false);
    expect(estErreurDeVersion(undefined)).toBe(false);
    expect(estErreurDeVersion(null)).toBe(false);
  });
});

/** Document minimal : une fenêtre ouverte ou non, un champ actif ou non. */
function faux(fenetre: boolean, champ: boolean): Document {
  return {
    querySelector: () => (fenetre ? {} : null),
    activeElement: { matches: () => champ },
  } as unknown as Document;
}

describe("doitRecharger", () => {
  it("recharge sur une page de consultation sans rien d'ouvert", () => {
    expect(doitRecharger(faux(false, false), "/recipes/abc")).toBe(true);
    expect(doitRecharger(faux(false, false), "/")).toBe(true);
  });

  it("ne recharge jamais pendant une saisie", () => {
    expect(doitRecharger(faux(true, false), "/")).toBe(false);
    expect(doitRecharger(faux(false, true), "/")).toBe(false);
    expect(doitRecharger(faux(false, false), "/recipes/new")).toBe(false);
    expect(doitRecharger(faux(false, false), "/recipes/abc/edit")).toBe(false);
    expect(doitRecharger(faux(false, false), "/fournisseurs/abc/commande")).toBe(false);
    expect(doitRecharger(faux(false, false), "/settings/import-json")).toBe(false);
  });
});
