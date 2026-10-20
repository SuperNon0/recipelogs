import {
  PDFArray,
  PDFDocument,
  PDFName,
  type PDFOperator,
  type PDFPage,
  fill,
  lineTo,
  moveTo,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  setFillingRgbColor,
  setLineWidth,
  setStrokingRgbColor,
  stroke,
} from "pdf-lib";
import { PAPER_COLORS, type CookbookTheme } from "./theme";

/**
 * Habillage des pages (papier + cadre), dessiné APRÈS le rendu Chromium avec
 * pdf-lib. En impression, Chromium coupe fonds et décors aux marges ; ici on
 * dessine sur la page entière, au millimètre près, quelle que soit la version
 * de Chromium du serveur.
 *  - papier (couleur, quadrillage, lignes) : SOUS le texte ;
 *  - cadre / coins / liseré / bandeau : par-dessus, dans les marges.
 */

const MM = 72 / 25.4;

type Rgb = { r: number; g: number; b: number };

function hexToRgb01(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/** Opérateurs du papier (fond + lignes), en coordonnées PDF (origine en bas à gauche). */
function paperOps(theme: CookbookTheme, w: number, h: number): PDFOperator[] {
  const ops: PDFOperator[] = [pushGraphicsState()];
  const bg = PAPER_COLORS[theme.paper];
  if (bg) {
    const c = hexToRgb01(bg);
    ops.push(setFillingRgbColor(c.r, c.g, c.b), rectangle(0, 0, w, h), fill());
  }
  const line = (x1: number, y1: number, x2: number, y2: number) => ops.push(moveTo(x1, y1), lineTo(x2, y2), stroke());

  if (theme.paper === "grid") {
    const c = hexToRgb01("#dfe7f0");
    ops.push(setStrokingRgbColor(c.r, c.g, c.b), setLineWidth(0.35));
    const step = 5 * MM;
    for (let x = step; x < w; x += step) line(x, 0, x, h);
    for (let y = step; y < h; y += step) line(0, y, w, y);
  }
  if (theme.paper === "lined") {
    const c = hexToRgb01("#e1e9f3");
    ops.push(setStrokingRgbColor(c.r, c.g, c.b), setLineWidth(0.5));
    for (let y = h - 18 * MM; y > 18 * MM; y -= 8 * MM) line(0, y, w, y);
    const m = hexToRgb01("#f2c4c4");
    ops.push(setStrokingRgbColor(m.r, m.g, m.b), setLineWidth(0.6));
    line(9 * MM, 0, 9 * MM, h);
  }
  ops.push(popGraphicsState());
  return ops;
}

/** Ajoute des opérateurs AVANT le contenu existant de la page (= dessous). */
function drawUnder(doc: PDFDocument, page: PDFPage, ops: PDFOperator[]) {
  const ref = doc.context.register(doc.context.contentStream(ops));
  const contents = page.node.Contents();
  const arr = contents instanceof PDFArray
    ? contents
    : doc.context.obj(contents ? [page.node.get(PDFName.of("Contents"))] : []);
  arr.insert(0, ref);
  page.node.set(PDFName.of("Contents"), arr);
}

function drawFrame(page: PDFPage, theme: CookbookTheme) {
  const { width: w, height: h } = page.getSize();
  const a = hexToRgb01(theme.accentColor);
  const color = rgb(a.r, a.g, a.b);
  const inset = 4.5 * MM;

  switch (theme.pageFrame) {
    case "line":
      page.drawRectangle({ x: inset, y: inset, width: w - 2 * inset, height: h - 2 * inset, borderColor: color, borderWidth: 0.8 });
      break;
    case "double": {
      page.drawRectangle({ x: inset, y: inset, width: w - 2 * inset, height: h - 2 * inset, borderColor: color, borderWidth: 1.4 });
      const i2 = inset + 1.4 * MM;
      page.drawRectangle({ x: i2, y: i2, width: w - 2 * i2, height: h - 2 * i2, borderColor: color, borderWidth: 0.5 });
      break;
    }
    case "corners": {
      const arm = 14 * MM;
      const corners: [number, number, number, number][] = [
        [inset, inset, 1, 1], [w - inset, inset, -1, 1], [inset, h - inset, 1, -1], [w - inset, h - inset, -1, -1],
      ];
      for (const [x, y, dx, dy] of corners) {
        page.drawLine({ start: { x, y }, end: { x: x + dx * arm, y }, thickness: 1.4, color });
        page.drawLine({ start: { x, y }, end: { x, y: y + dy * arm }, thickness: 1.4, color });
        const s = 1.6 * MM;
        page.drawRectangle({ x: x + dx * 1.8 * MM - s / 2, y: y + dy * 1.8 * MM - s / 2, width: s, height: s, color });
      }
      break;
    }
    case "side":
      page.drawRectangle({ x: 0, y: 0, width: 4 * MM, height: h, color });
      break;
    case "band":
      page.drawRectangle({ x: 0, y: h - 5 * MM, width: w, height: 5 * MM, color });
      break;
  }
}

/** Habille toutes les pages (sauf la 1ʳᵉ si `skipFirstPage`, ex. la couverture). */
export async function decoratePdf(
  pdf: Uint8Array,
  theme: CookbookTheme,
  opts: { skipFirstPage?: boolean } = {},
): Promise<Uint8Array> {
  if (theme.paper === "white" && theme.pageFrame === "none") return pdf;
  const doc = await PDFDocument.load(pdf);
  doc.getPages().forEach((page, i) => {
    if (opts.skipFirstPage && i === 0) return;
    const { width, height } = page.getSize();
    if (theme.paper !== "white") drawUnder(doc, page, paperOps(theme, width, height));
    if (theme.pageFrame !== "none") drawFrame(page, theme);
  });
  return doc.save();
}
