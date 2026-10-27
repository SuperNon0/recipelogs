import { NextResponse } from "next/server";
import { buildProductionSheet, listProductionItems } from "@/lib/productionData";
import { renderProductionPdf } from "@/lib/pdf/productionPdf";
import { getDefaultPdfTheme } from "@/lib/pdfThemes";

/** PDF de la fiche de production en cours (toutes les recettes ajoutées). ?inline=1 : aperçu, ?etapes=1 : avec les étapes. */
export async function GET(req: Request) {
  const items = await listProductionItems();
  if (items.length === 0) return new NextResponse("Fiche de production vide", { status: 404 });
  const sheet = await buildProductionSheet(items.map((i) => ({ recipeId: i.recipeId, amount: i.amount })));
  const theme = await getDefaultPdfTheme();
  const url = new URL(req.url);
  const pdf = await renderProductionPdf(sheet, theme.config, "Fiche de production", url.searchParams.get("etapes") === "1");
  const inline = url.searchParams.get("inline") === "1";
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="fiche-de-production.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
