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

  it("garde la propre clé du client même en « Claude (MCP) seulement »", () => {
    expect(calculerModes("mcp", "cle", null)).toMatchObject({ ia: true, mcp: true });
  });
});
