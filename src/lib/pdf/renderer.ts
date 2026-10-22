import puppeteer, { type Browser } from "puppeteer";
import { PDFArray, PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { inlineGoogleFonts } from "./fonts";

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
 * File d'attente : un seul rendu à la fois. Le service est limité en mémoire
 * (MemoryMax) ; plusieurs PDF demandés en même temps faisaient planter le serveur.
 */

/**
 * Chromium partagé : lancer un navigateur coûte ~1 à 1,5 s, on le garde donc
 * ouvert entre deux rendus (et entre les 2 passes d'un cahier), puis on le
 * ferme après BROWSER_IDLE_MS d'inactivité pour rendre la mémoire.
 * Stocké sur globalThis pour survivre au rechargement à chaud en dev.
 */
const BROWSER_IDLE_MS = 3 * 60 * 1000;
const shared = globalThis as unknown as {
  __pdfBrowser?: Promise<Browser> | null;
  __pdfBrowserTimer?: ReturnType<typeof setTimeout>;
  /** File d'attente globale (le module peut être chargé par plusieurs routes). */
  __pdfQueue?: Promise<unknown>;
};

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const run = (shared.__pdfQueue ?? Promise.resolve()).then(task, task);
  shared.__pdfQueue = run.catch(() => undefined);
  return run;
}

function getBrowser(): Promise<Browser> {
  if (!shared.__pdfBrowser) {
    const launching = puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    shared.__pdfBrowser = launching;
    launching.then(
      (browser) => browser.on("disconnected", () => {
        // Chromium planté ou fermé : le prochain rendu en relancera un.
        if (shared.__pdfBrowser === launching) shared.__pdfBrowser = null;
      }),
      () => {
        if (shared.__pdfBrowser === launching) shared.__pdfBrowser = null;
      },
    );
  }
  return shared.__pdfBrowser;
}

function scheduleBrowserClose() {
  clearTimeout(shared.__pdfBrowserTimer);
  shared.__pdfBrowserTimer = setTimeout(() => {
    const pending = shared.__pdfBrowser;
    shared.__pdfBrowser = null;
    pending?.then((b) => b.close()).catch(() => undefined);
  }, BROWSER_IDLE_MS);
  shared.__pdfBrowserTimer.unref?.();
}

type Align = "left" | "center" | "right";

export type RenderOptions = {
  footer?: string | null;
  footerAlign?: Align;
  /** Affiche le numéro de page dans le footer. */
  showPageNumber?: boolean;
  /** Place du numéro de page (centré par défaut). */
  pageNumberAlign?: Align;
  /** Texte répété en haut de chaque page (rien si vide). */
  header?: string | null;
  headerAlign?: Align;
  /** Marge gauche / droite de la page (mm), pour aligner en-tête et pied sur le texte. */
  sideMarginMm?: number;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Bandeau en 3 zones (gauche / centre / droite) pour l'en-tête ou le pied de page. */
function bandHtml(zones: Record<Align, string[]>, sideMm: number): string {
  const cell = (a: Align) => `<span style="text-align:${a}">${zones[a].join(" &nbsp;·&nbsp; ")}</span>`;
  return `<div style="
      font-size: 8pt;
      color: #888;
      width: 100%;
      padding: 0 ${sideMm}mm;
      font-family: -apple-system, Arial, sans-serif;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: 4mm;
      align-items: center;
    ">${cell("left")}${cell("center")}${cell("right")}</div>`;
}

export function renderHtmlToPdf(
  html: string,
  format: "A4" | "A5" = "A4",
  options: RenderOptions = {},
): Promise<Uint8Array> {
  return runExclusive(() => renderHtmlToPdfNow(html, format, options));
}

async function renderHtmlToPdfNow(
  html: string,
  format: "A4" | "A5" = "A4",
  options: RenderOptions = {},
): Promise<Uint8Array> {
  clearTimeout(shared.__pdfBrowserTimer);
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // « load » attend les feuilles de style et les <img> ; on attend ensuite
    // les polices réellement utilisées, puis les éventuelles images de fond
    // (couverture) avec un court délai d'inactivité réseau. Bien plus rapide
    // que networkidle0 (500 ms d'attente fixe même sans aucune ressource).
    await page.setContent(await inlineGoogleFonts(html), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForNetworkIdle({ idleTime: 150, timeout: 10_000 }).catch(() => undefined);

    const sideMm = options.sideMarginMm ?? 12;
    const footerText = (options.footer ?? "").trim();
    const headerText = (options.header ?? "").trim();
    const hasFooter = footerText.length > 0 || !!options.showPageNumber;
    const hasHeader = headerText.length > 0;

    // Pied de page : le texte et le numéro vont chacun dans leur zone
    // (sur la même zone, ils sont séparés par un point médian).
    const footerZones: Record<Align, string[]> = { left: [], center: [], right: [] };
    if (footerText) footerZones[options.footerAlign ?? "left"].push(escapeHtml(footerText));
    if (options.showPageNumber) footerZones[options.pageNumberAlign ?? "center"].push(`<span class="pageNumber"></span>`);
    const headerZones: Record<Align, string[]> = { left: [], center: [], right: [] };
    if (headerText) headerZones[options.headerAlign ?? "left"].push(escapeHtml(headerText));

    const empty = '<span style="display:none"></span>';
    const footerHtml = hasFooter ? bandHtml(footerZones, sideMm) : empty;
    const headerHtml = hasHeader ? bandHtml(headerZones, sideMm) : empty;

    const pdf = await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: hasFooter || hasHeader,
      headerTemplate: headerHtml,
      footerTemplate: footerHtml,
    });

    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    await page.close().catch(() => undefined);
    scheduleBrowserClose();
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
