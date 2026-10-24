import { describe, expect, it } from "vitest";
import { fullVersion } from "@/lib/version";

describe("fullVersion", () => {
  it("ajoute le numéro de la dernière PR à la version du journal", () => {
    expect(fullVersion("V2.3", "88")).toBe("V2.3.88");
  });

  it("sans PR connue (pas de git au build) : la version seule", () => {
    expect(fullVersion("V2.3", "")).toBe("V2.3");
  });
});
