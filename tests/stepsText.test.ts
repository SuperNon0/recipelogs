import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "@/lib/stepsText";

describe("étapes en texte simple", () => {
  it("laisse le texte simple tel quel", () => {
    expect(htmlToPlainText("Mélanger\nCuire")).toBe("Mélanger\nCuire");
  });

  it("convertit une liste HTML numérotée en une étape par ligne", () => {
    expect(htmlToPlainText("<ol><li>Mélanger</li><li>Cuire &amp; servir</li></ol>")).toBe(
      "Mélanger\nCuire & servir",
    );
  });

  it("convertit des paragraphes et retire les numéros", () => {
    expect(htmlToPlainText("<p>1. Mélanger</p><p>2) <strong>Cuire</strong></p>")).toBe("Mélanger\nCuire");
  });
});
