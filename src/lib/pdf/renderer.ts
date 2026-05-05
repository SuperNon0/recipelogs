import puppeteer from "puppeteer";

/**
 * Rendu HTML → PDF via Puppeteer (Chromium headless).
 *
 * - `format` (A4/A5) est respecté nativement (le CSS @page n'a plus de `size`).
 * - `footer` est rendu sur chaque page via le mécanisme natif de Puppeteer
 *   (`displayHeaderFooter` + `footerTemplate`), pas via `position: fixed`
 *   qui ne marche que sur la première page.
 */
export async function renderHtmlToPdf(
  html: string,
  format: "A4" | "A5" = "A4",
  options: {
    footer?: string | null;
    coverFirstPage?: boolean;
  } = {},
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const hasFooter = !!options.footer && options.footer.trim().length > 0;
    const escapedFooter = hasFooter
      ? (options.footer as string)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      : "";

    const pdf = await page.pdf({
      format,
      printBackground: true,
      // Marges minimales si pas de footer ; un peu plus en bas pour laisser
      // la place au footer Puppeteer.
      margin: hasFooter
        ? { top: "10mm", bottom: "16mm", left: "12mm", right: "12mm" }
        : { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: hasFooter,
      headerTemplate: '<span style="display:none"></span>',
      footerTemplate: hasFooter
        ? `<div style="
            font-size: 8pt;
            color: #888;
            text-align: center;
            width: 100%;
            padding: 0 12mm;
            font-family: -apple-system, Arial, sans-serif;
          ">${escapedFooter}</div>`
        : '<span style="display:none"></span>',
    });

    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    await browser.close();
  }
}
