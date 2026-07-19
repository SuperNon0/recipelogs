import puppeteer from "puppeteer";

/**
 * Rendu HTML → PDF via Puppeteer (Chromium headless).
 *
 * - `format` (A4/A5) appliqué nativement par Puppeteer.
 * - `footer` rendu sur chaque page via `displayHeaderFooter` + `footerTemplate`.
 * - `footerAlign` aligne le pied de page (gauche / centre / droite / justifié).
 * - `showPageNumbers` ajoute la pagination "X / Y" au pied de page.
 */
export async function renderHtmlToPdf(
  html: string,
  format: "A4" | "A5" = "A4",
  options: {
    footer?: string | null;
    footerAlign?: "left" | "center" | "right" | "justify";
    showPageNumbers?: boolean;
  } = {},
): Promise<Uint8Array> {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const footerText = options.footer?.trim() ?? "";
    const hasFooterText = footerText.length > 0;
    const showPages = options.showPageNumbers === true;
    const align = options.footerAlign ?? "center";
    const needsFooter = hasFooterText || showPages;

    const escapedFooter = hasFooterText
      ? footerText
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
      : "";

    let footerTemplate = '<span style="display:none"></span>';
    if (needsFooter) {
      const baseStyle = `
        font-size: 8pt;
        color: #888;
        font-family: -apple-system, Arial, sans-serif;
        width: 100%;
        padding: 0 12mm;
        box-sizing: border-box;
      `;
      const pageHtml = showPages
        ? `<span class="pageNumber"></span> / <span class="totalPages"></span>`
        : "";

      if (align === "justify" && hasFooterText && showPages) {
        // Justifié : texte à gauche, pagination à droite
        footerTemplate = `
          <div style="${baseStyle} display: flex; justify-content: space-between; align-items: center;">
            <span>${escapedFooter}</span>
            <span>${pageHtml}</span>
          </div>`;
      } else if (align === "left") {
        const content = hasFooterText
          ? showPages
            ? `${escapedFooter} <span style="margin-left: 8px; color: #aaa;">· ${pageHtml}</span>`
            : escapedFooter
          : pageHtml;
        footerTemplate = `<div style="${baseStyle} text-align: left;">${content}</div>`;
      } else if (align === "right") {
        const content = hasFooterText
          ? showPages
            ? `${pageHtml} <span style="margin-left: 8px; color: #aaa;">· ${escapedFooter}</span>`
            : escapedFooter
          : pageHtml;
        footerTemplate = `<div style="${baseStyle} text-align: right;">${content}</div>`;
      } else {
        // center (défaut)
        const content = hasFooterText
          ? showPages
            ? `${escapedFooter} · ${pageHtml}`
            : escapedFooter
          : pageHtml;
        footerTemplate = `<div style="${baseStyle} text-align: center;">${content}</div>`;
      }
    }

    const pdf = await page.pdf({
      format,
      printBackground: true,
      // Marges fixes : la couverture les casse via des marges négatives en CSS (full-bleed).
      margin: needsFooter
        ? { top: "10mm", bottom: "16mm", left: "12mm", right: "12mm" }
        : { top: "10mm", bottom: "10mm", left: "12mm", right: "12mm" },
      displayHeaderFooter: needsFooter,
      headerTemplate: '<span style="display:none"></span>',
      footerTemplate,
    });

    return new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  } finally {
    await browser.close();
  }
}
