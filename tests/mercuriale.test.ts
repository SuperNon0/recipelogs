import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { devinerColonnes, ligneEntete, lignesDepuisTableau, lireContenance } from "@/lib/mercuriale";
import { lireCsv, lireTableur, texteCsv } from "@/lib/mercurialeFichier";

describe("mercuriale CSV", () => {
  it("lit un CSV Excel français (point-virgule, guillemets, Windows-1252)", () => {
    const csv = "Tarifs novembre;;\nCode;Désignation;Cond.;Prix HT\nA1;\"Farine T45; sac\";25 kg;23,00\nA2;Crème 35 %;1 L;4,10\n";
    const bytes = Buffer.from(csv, "latin1");
    const lignes = lireCsv(texteCsv(bytes));
    expect(lignes[2]).toEqual(["A1", "Farine T45; sac", "25 kg", "23,00"]);
    expect(lignes[3][1]).toBe("Crème 35 %");
    const e = ligneEntete(lignes);
    expect(e).toBe(1);
    const col = devinerColonnes(lignes[e]);
    expect(col).toMatchObject({ reference: 0, produit: 1, contenance: 2, prix: 3 });
  });

  it("transforme les lignes en prix", () => {
    const lignes = [["Désignation", "Conditionnement", "Prix colis", "Unité"], ["Sucre", "1 kg", "1,20", ""], ["Gobelet", "x 50", "6", "colis"], ["Sous-total", "", "", ""]];
    const col = devinerColonnes(lignes[0]);
    expect(col).toMatchObject({ produit: 0, contenance: 1, prixColis: 2, unite: 3 });
    const l = lignesDepuisTableau(lignes, 0, col);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ produit: "Sucre", contenance: 1, unite: "kg", prixColis: 1.2 });
    expect(l[1]).toMatchObject({ produit: "Gobelet", contenance: 50, unite: "pièce", prixColis: 6 });
  });

  it("comprend les contenances", () => {
    expect(lireContenance("500 g")).toEqual({ valeur: 0.5, unite: "kg" });
    expect(lireContenance("75cl")).toEqual({ valeur: 0.75, unite: "L" });
    expect(lireContenance("x 250")).toEqual({ valeur: 250, unite: "pièce" });
    expect(lireContenance("12")).toEqual({ valeur: 12, unite: null });
    expect(lireContenance("-")).toBeNull();
  });
});

describe("mercuriale Excel", () => {
  it("lit la première feuille d'un .xlsx (textes partagés et nombres)", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", '<workbook><sheets><sheet name="Prix" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file("xl/sharedStrings.xml", "<sst><si><t>Libellé</t></si><si><t>Prix HT</t></si><si><r><t>Chocolat </t></r><r><t>noir 64 %</t></r></si></sst>");
    zip.file(
      "xl/worksheets/sheet1.xml",
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>18.5</v></c></row></sheetData></worksheet>',
    );
    const bytes = await zip.generateAsync({ type: "nodebuffer" });
    const lignes = await lireTableur("tarifs.xlsx", bytes);
    expect(lignes).toEqual([["Libellé", "", "Prix HT"], ["Chocolat noir 64 %", "", "18.5"]]);
  });

  it("refuse un vieux .xls", async () => {
    await expect(lireTableur("vieux.xls", Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))).rejects.toThrow(/xlsx/);
  });
});
