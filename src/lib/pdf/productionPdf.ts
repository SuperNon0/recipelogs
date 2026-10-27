import type { ProductionSheet } from "@/lib/productionData";
import { formatG, formatQty } from "@/lib/format";
import { FONTS, googleFontsHref, type CookbookTheme } from "./theme";
import { renderHtmlToPdf } from "./renderer";
import { htmlToPlainText } from "@/lib/stepsText";
import { rescaleStepText } from "@/lib/stepQty";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Quantité à peser : grammes au-delà de 1 kg en kg, pièces, QS. */
function qtyText(qty: number, unit: string): string {
  if (unit === "QS") return "QS";
  return formatQty(Math.round(qty * 100) / 100, unit);
}

/**
 * HTML de la fiche de production : une préparation par encadré (gros chiffres,
 * case à cocher par pesée), puis le total par ingrédient. Couleurs et polices
 * du thème PDF par défaut, mise en page « labo » sobre.
 */
export function buildProductionHtml(sheet: ProductionSheet, theme: CookbookTheme, title: string, withSteps = false): string {
  const fonts = googleFontsHref(theme);
  const titleFont = FONTS[theme.titleFont]?.family ?? "Arial, sans-serif";
  const bodyFont = FONTS[theme.bodyFont]?.family ?? "Arial, sans-serif";
  const accent = theme.accentColor;
  const products = sheet.blocks.filter((b) => b.isProduct);

  const block = (b: ProductionSheet["blocks"][number]) => `
    <section class="blk${b.isProduct ? " prod" : ""}">
      <header>
        <h2>${esc(b.name)}${b.target ? ` <span class="tgt">${esc(b.target)}</span>` : ""}</h2>
        <span class="mass">${formatG(Math.round(b.massG))}</span>
      </header>
      ${b.usedIn.length ? `<p class="for">Pour ${esc(b.usedIn.join(", "))}</p>` : ""}
      <table>
        ${b.lines
          .map((l) =>
            l.kind === "title"
              ? `<tr class="ttl"><td colspan="3">${esc(l.name)}</td></tr>`
              : `<tr><td class="box"></td><td>${esc(l.name)}</td><td class="q">${qtyText(l.qty, l.unit)}</td></tr>`,
          )
          .join("")}
      </table>
      ${withSteps && b.steps ? stepsHtml(b.steps, b.coef) : ""}
    </section>`;

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ${bodyFont}; color: ${theme.textColor}; font-size: 11pt; }
  h1 { font-family: ${titleFont}; font-size: 20pt; margin: 0 0 2mm; color: ${accent}; }
  .sum { margin: 0 0 6mm; color: #555; font-size: 10pt; }
  .sum b { color: ${theme.textColor}; }
  .blk { border: 0.4mm solid #bbb; border-radius: 2.5mm; padding: 3.5mm 4mm 2mm; margin-bottom: 4.5mm; break-inside: avoid; }
  .blk.prod { border-color: ${accent}; }
  .blk header { display: flex; justify-content: space-between; align-items: baseline; gap: 4mm; }
  .blk h2 { font-family: ${titleFont}; font-size: 14pt; margin: 0; }
  .tgt { font-family: ${bodyFont}; font-size: 11pt; font-weight: 600; color: ${accent}; margin-left: 2mm; }
  .mass { font-size: 11pt; color: #555; white-space: nowrap; }
  .for { margin: 0.5mm 0 1.5mm; font-size: 9pt; color: #777; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1.6mm 0; border-top: 0.2mm solid #e2e2e2; vertical-align: middle; }
  td.box { width: 7mm; }
  td.box::before { content: ""; display: block; width: 3.6mm; height: 3.6mm; border: 0.35mm solid #888; border-radius: 0.7mm; }
  td.q { text-align: right; font-size: 13pt; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.ttl td { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${accent}; font-weight: 600; padding-top: 2.5mm; }
  .steps { margin: 2.5mm 0 1mm; padding-left: 5mm; font-size: 10pt; color: #333; }
  .steps li { margin: 0.8mm 0; }
  .steps li.st { list-style: none; margin-left: -5mm; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: ${accent}; font-weight: 600; }
  .tot { break-before: page; }
  .tot h2 { font-family: ${titleFont}; font-size: 15pt; margin: 0 0 3mm; }
  .tot td { font-size: 10.5pt; }
  .tot td.q { font-size: 11pt; }
</style></head><body>
  <h1>${esc(title)}</h1>
  <p class="sum">${products.map((p) => `<b>${esc(p.name)}</b> : ${esc(p.target ?? "")}`).join(" · ")} — ${formatG(Math.round(sheet.massG))} à peser en tout</p>
  ${sheet.blocks.map(block).join("")}
  ${
    sheet.totals.length
      ? `<section class="tot"><h2>Total à sortir</h2><table>${sheet.totals
          .map((t) => `<tr><td class="box"></td><td>${esc(t.name)}</td><td class="q">${t.qty === null ? "QS" : qtyText(t.qty, t.unit)}</td></tr>`)
          .join("")}</table></section>`
      : ""
  }
</body></html>`;
}

/** Étapes d'une préparation, quantités liées à l'échelle ; « # Titre » en intertitre. */
function stepsHtml(raw: string, coef: number): string {
  const lines = htmlToPlainText(raw).split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  let n = 0;
  return `<ol class="steps">${lines
    .map((l) => {
      const text = esc(rescaleStepText(l, coef).replace(/\{\s*([^}]*)\}/g, "$1"));
      // Les intertitres ne prennent pas de numéro.
      return l.startsWith("#") ? `<li class="st">${text.replace(/^#\s*/, "")}</li>` : `<li value="${++n}">${text}</li>`;
    })
    .join("")}</ol>`;
}

export async function renderProductionPdf(sheet: ProductionSheet, theme: CookbookTheme, title: string, withSteps = false): Promise<Uint8Array> {
  return renderHtmlToPdf(buildProductionHtml(sheet, theme, title, withSteps), "A4", { showPageNumber: true, footer: title });
}
