import puppeteer from "puppeteer";

/**
 * Rendu HTML → PDF via Puppeteer (Chromium headless).
 *
 * - Le format (A4/A5) et les marges sont contrôlés par les règles CSS @page
 *   du HTML (preferCSSPageSize: true), ce qui permet d'avoir une couverture
 *   en full-bleed via @page :first { margin: 0 }.
 * - Le pied de page est rendu sur chaque page via Puppeteer
 *   (`displayHeaderFooter` + `footerTemplate`). Sur la page de couverture
 *   (margin: 0), l'espace est nul → le footer ne s'imprime pas, ce qui est
 *   exactement ce qu'on veut.
 */
export async function renderHtmlToPdf(
  html: string,
  format: "A4" | "A5" = "A4",
  options: {
    footer?: string | null;
    footerAlign?: "left" | "center" | "right" | "justify";
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
    const align = options.footerAlign ?? "center";

    const pdf = await page.pdf({
      format,
      printBackground: true,
      // Délègue les marges au CSS (@page) pour pouvoir avoir une couverture
      // en full-bleed (@page :first { margin: 0 }).
      preferCSSPageSize: true,
      displayHeaderFooter: hasFooter,
      headerTemplate: '<span style="display:none"></span>',
      footerTemplate: hasFooter
        ? `<div style="
            font-size: 8pt;
            color: #888;
            text-align: ${align};
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
