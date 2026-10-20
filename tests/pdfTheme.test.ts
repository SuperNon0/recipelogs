import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { cookbookThemeSchema, parseTheme, THEME_PRESETS, DEFAULT_THEME } from "@/lib/pdf/theme";
import { decoratePdf } from "@/lib/pdf/decorate";

describe("thèmes PDF", () => {
  it("un ancien thème enregistré garde l'apparence d'origine", () => {
    const old = parseTheme({ accentColor: "#123456", coverLayout: "framed" });
    expect(old.accentColor).toBe("#123456");
    expect(old.recipeLayout).toBe("classique");
    expect(old.paper).toBe("white");
    expect(old.pageFrame).toBe("none");
    expect(old.titleStyle).toBe("simple");
  });

  it("chaque style prêt à l'emploi produit un thème valide", () => {
    for (const p of THEME_PRESETS) {
      expect(cookbookThemeSchema.safeParse({ ...DEFAULT_THEME, ...p.values }).success, p.key).toBe(true);
    }
  });
});

async function blankPdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([420, 595]);
  return doc.save();
}

describe("decoratePdf", () => {
  it("ne touche pas au PDF sans papier ni décor", async () => {
    const pdf = await blankPdf(2);
    expect(await decoratePdf(pdf, DEFAULT_THEME)).toBe(pdf);
  });

  it("habille toutes les pages sans en ajouter", async () => {
    for (const p of THEME_PRESETS) {
      const out = await decoratePdf(await blankPdf(3), { ...DEFAULT_THEME, ...p.values });
      const doc = await PDFDocument.load(out);
      expect(doc.getPageCount(), p.key).toBe(3);
    }
  });

  it("laisse la couverture intacte avec skipFirstPage", async () => {
    const out = await decoratePdf(await blankPdf(2), { ...DEFAULT_THEME, paper: "cream", pageFrame: "double" }, { skipFirstPage: true });
    const doc = await PDFDocument.load(out);
    const [cover, page] = doc.getPages();
    expect(cover.node.Contents()).toBeUndefined();
    expect(page.node.Contents()).toBeDefined();
  });
});
