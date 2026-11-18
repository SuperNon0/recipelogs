import { describe, expect, it } from "vitest";
import { calculerModes } from "@/lib/ia/analyse";

describe("IA ou Claude (MCP) pour lire les documents", () => {
  it("suit ce que permet le panel", () => {
    expect(calculerModes("ia", "plateforme", "mcp")).toEqual({ panel: "ia", ia: true, mcp: false, prefere: "ia" });
    expect(calculerModes("mcp", "plateforme", "ia")).toEqual({ panel: "mcp", ia: false, mcp: true, prefere: "mcp" });
  });

  it("avec les deux, met en avant le mode choisi dans les réglages", () => {
    expect(calculerModes("les-deux", "plateforme", "mcp").prefere).toBe("mcp");
    expect(calculerModes("les-deux", "plateforme", "ia").prefere).toBe("ia");
    // Sans choix : l'IA si elle est réglée, sinon Claude.
    expect(calculerModes("les-deux", "plateforme", null).prefere).toBe("ia");
    expect(calculerModes("les-deux", "off", null).prefere).toBe("mcp");
  });

  it("« Claude (MCP) seulement » : pas d'IA, même avec une clé enregistrée", () => {
    expect(calculerModes("mcp", "cle", null)).toMatchObject({ ia: false, mcp: true });
  });

  it("accès MCP coupé pour ce client : pas de « Garder pour Claude »", () => {
    expect(calculerModes("les-deux", "plateforme", "mcp", false)).toMatchObject({ ia: true, mcp: false, prefere: "ia" });
  });
});

describe("ni IA ni Claude", () => {
  it("« Aucun » : rien à proposer", () => {
    expect(calculerModes("aucun", "plateforme", "ia")).toMatchObject({ ia: false, mcp: false });
  });
});
