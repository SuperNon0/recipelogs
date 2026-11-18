import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatEuro } from "../cost";
import { qtyLabel } from "../supplierOrders";
import type { SupplierOrderDetail } from "../supplierOrdersDb";

/**
 * Bon de commande en PDF, fait avec pdf-lib (pas de navigateur lancé) : rapide
 * et presque sans mémoire sur le serveur, même pour plusieurs centaines de lignes.
 */

const W = 595.28; // A4
const H = 841.89;
const M = 42;
const INK = rgb(0.13, 0.12, 0.11);
const MUTED = rgb(0.45, 0.43, 0.4);
const LINE = rgb(0.85, 0.83, 0.8);

// Caractères en dehors de l'encodage des polices standard (WinAnsi) : remplacés.
const EXTRA = new Set("€œŒ’‘“”–—…•šŠžŽŸƒ‹›™");
function safe(s: string): string {
  return s
    .replace(/[    ]/g, " ")
    .replace(/[×]/g, "x")
    .split("")
    .map((c) => (c.charCodeAt(0) < 256 || EXTRA.has(c) ? c : "?"))
    .join("");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of safe(text).split("\n")) {
    let cur = "";
    for (const word of para.split(" ")) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width || !cur) cur = next;
      else {
        out.push(cur);
        cur = word;
      }
    }
    out.push(cur);
  }
  return out;
}

const frDay = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

export async function orderPdf(o: SupplierOrderDetail, shop?: string | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Commande ${o.supplier} du ${frDay(o.date)}`));
  doc.setProducer("RecipeLog");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, size: number, f = font, color = INK) => page.drawText(safe(t), { x, y, size, font: f, color });

  // En-tête
  text("Bon de commande", M, 20, bold);
  y -= 26;
  text(o.supplier, M, 14, bold);
  y -= 18;
  const infos = [
    `Commande du ${frDay(o.date)}`,
    o.deliveryDate ? `Livraison souhaitée le ${frDay(o.deliveryDate)}` : null,
    o.place ? `Lieu de livraison : ${o.place}` : shop ? `Pour : ${shop}` : null,
    o.addedBy ? `Passée par ${o.addedBy}` : null,
  ].filter((x): x is string => !!x);
  for (const l of infos) {
    text(l, M, 10.5, font, MUTED);
    y -= 14;
  }
  y -= 8;

  // Tableau
  const colQty = M;
  const colName = M + 92;
  const colRef = W - M - 150;
  const colPrice = W - M - 70;
  const nameWidth = colRef - colName - 8;
  const header = () => {
    page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 18, color: rgb(0.95, 0.94, 0.92) });
    y += 1;
    text("Quantité", colQty + 4, 9.5, bold);
    text("Produit", colName, 9.5, bold);
    text("Réf.", colRef, 9.5, bold);
    text("Prix estimé", colPrice, 9.5, bold);
    y -= 21;
  };
  header();
  for (const l of o.lines) {
    const name = wrap(l.label, font, 10, nameWidth);
    const h = name.length * 12.5 + 6;
    if (y - h < M + 30) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    text(qtyLabel(l.quantity, l.unit), colQty + 4, 10, bold);
    name.forEach((n, i) => page.drawText(n, { x: colName, y: y - i * 12.5, size: 10, font, color: INK }));
    if (l.reference) text(l.reference.slice(0, 22), colRef, 9, font, MUTED);
    if (l.unitPrice != null) text(formatEuro(l.unitPrice * l.quantity), colPrice, 9.5, font, MUTED);
    y -= h - 6;
    page.drawLine({ start: { x: M, y: y - 1 }, end: { x: W - M, y: y - 1 }, thickness: 0.5, color: LINE });
    y -= 13;
  }

  y -= 6;
  if (y < M + 60) {
    page = doc.addPage([W, H]);
    y = H - M;
  }
  text(`${o.lines.length} ligne${o.lines.length > 1 ? "s" : ""}`, M, 10.5, bold);
  if (o.estimate != null) {
    const t = `Total estimé : ${formatEuro(o.estimate)} HT${o.unpriced ? ` (sans ${o.unpriced} ligne${o.unpriced > 1 ? "s" : ""} sans prix)` : ""}`;
    page.drawText(safe(t), { x: W - M - font.widthOfTextAtSize(safe(t), 10.5), y, size: 10.5, font, color: INK });
  }
  y -= 22;
  if (o.note) {
    text("Remarque", M, 10.5, bold);
    y -= 14;
    for (const l of wrap(o.note, font, 10, W - 2 * M)) {
      if (y < M) {
        page = doc.addPage([W, H]);
        y = H - M;
      }
      text(l, M, 10);
      y -= 13;
    }
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = safe(`RecipeLog · commande n° ${o.id} · page ${i + 1}/${pages.length}`);
    p.drawText(t, { x: M, y: 22, size: 8, font, color: MUTED });
  });
  return doc.save();
}
