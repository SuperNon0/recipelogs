import puppeteer from "puppeteer";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";

/**
 * Rendu HTML → PDF via Puppeteer (Chromium headless).
 *
 * - Le format (A4/A5) et les marges sont contrôlés par les règles CSS @page
 *   du HTML (preferCSSPageSize: true), ce qui permet d'avoir une couverture
 *   en full-bleed via @page :first { margin: 0 }.
 * - Le pied de page (3 zones : gauche / numéro centré / droite) est rendu
 *   sur chaque page via Puppeteer (`displayHeaderFooter` + `footerTemplate`).
 *   Le numéro de page utilise la classe spéciale `.pageNumber` que Puppeteer
 *   substitue par le n° physique de la page DANS LE PDF rendu.
 *   → Pour avoir « 1 sur la 1ʳᵉ recette », on rend la couverture/sommaire
 *   d'un côté et les recettes de l'autre, puis on fusionne (cf. `mergePdfs`).
 */
/**
 * File d'attente : un seul Chromium à la fois. Le service est limité en
 * mémoire (MemoryMax) et chaque Chromium pèse plusieurs centaines de Mo ;
 * plusieurs PDF demandés en même temps faisaient planter le serveur.
 */
let queue: Promise<unknown> = Promise.resolve();
function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function renderHtmlToPdf(
  html: string,
  format: "A4" | "A5" = "A4",
  options: {
    footer?: string | null;
    footerAlign?: "left" | "right";
    /** Affiche le numéro de page (centré) dans le footer. */
    showPageNumber?: boolean;
  } = {},
): Promise<Uint8Array> {
  return runExclusive(() => renderHtmlToPdfNow(html, format, options));
}

async function renderHtmlToPdfNow(
  html: string,
  format: "A4" | "A5" = "A4",
  options: {
    footer?: string | null;
    footerAlign?: "left" | "right";
    /** Affiche le numéro de page (centré) dans le footer. */
    showPageNumber?: boolean;
  } = {},
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const footerText = (options.footer ?? "").trim();
    const hasFooter = footerText.length > 0 || !!options.showPageNumber;
    const escapedFooter = footerText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const align = options.footerAlign ?? "left";

    // Footer en 3 zones (CSS grid) : gauche / centre / droite.
    // - Le texte du footer va à gauche OU à droite selon `footerAlign`.
    // - Le numéro de page est TOUJOURS au centre (s'il est demandé).
    const leftHtml = align === "left" ? escapedFooter : "";
    const rightHtml = align === "right" ? escapedFooter : "";
    const centerHtml = options.showPageNumber
      ? `<span class="pageNumber"></span>`
      : "";

    const footerHtml = hasFooter
      ? `<div style="
            font-size: 8pt;
            color: #888;
            width: 100%;
            padding: 0 12mm;
            font-family: -apple-system, Arial, sans-serif;
            display: grid;
            grid-template-columns: 1fr auto 1fr;
            gap: 4mm;
            align-items: center;
          ">
            <span style="text-align:left">${leftHtml}</span>
            <span style="text-align:center">${centerHtml}</span>
            <span style="text-align:right">${rightHtml}</span>
          </div>`
      : '<span style="display:none"></span>';

    const pdf = await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: hasFooter,
      headerTemplate: '<span style="display:none"></span>',
      footerTemplate: footerHtml,
    });

    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    await browser.close();
  }
}

/**
 * Concatène plusieurs PDFs (Uint8Array) en un seul, dans l'ordre.
 */
export async function mergePdfs(pdfs: Uint8Array[]): Promise<Uint8Array> {
  if (pdfs.length === 0) {
    throw new Error("mergePdfs: aucun PDF à fusionner.");
  }
  if (pdfs.length === 1) return pdfs[0];

  const merged = await PDFDocument.create();
  for (const buf of pdfs) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  const out = await merged.save();
  return out;
}

/**
 * Lit, dans un PDF produit par Chromium, la page (1 = première) de chaque
 * ancre `<prefix><n>` ciblée par un lien. Renvoie un tableau indexé par n.
 */
export async function readAnchorPages(pdf: Uint8Array, prefix: string): Promise<number[]> {
  const doc = await PDFDocument.load(pdf);
  const pageRefs = doc.getPages().map((p) => p.ref.toString());
  const dests = doc.catalog.lookup(PDFName.of("Dests"));
  const result: number[] = [];
  if (!(dests instanceof PDFDict)) return result;
  for (const [key, value] of dests.entries()) {
    const name = decodeURIComponent(key.decodeText());
    if (!name.startsWith(prefix)) continue;
    const index = Number(name.slice(prefix.length));
    let dest = doc.context.lookup(value);
    if (dest instanceof PDFDict) dest = dest.lookup(PDFName.of("D"));
    if (!(dest instanceof PDFArray) || !Number.isInteger(index)) continue;
    const page = pageRefs.indexOf(dest.get(0).toString());
    if (page >= 0) result[index] = page + 1;
  }
  return result;
}
