import { NextResponse } from "next/server";
import { buildProductionSheet } from "@/lib/productionData";
import { renderProductionPdf } from "@/lib/pdf/productionPdf";
import { getDefaultPdfTheme } from "@/lib/pdfThemes";

/**
 * Fiche de production d'une recette seule.
 *  - ?n=60 : nombre de pièces (si la recette a un rendement), sinon multiplicateur
 *  - ?etapes=1 : avec les étapes (quantités liées à l'échelle)
 *  - ?inline=1 : affichage dans la page au lieu d'un téléchargement
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipeId = Number(id);
  const url = new URL(req.url);
  const amount = Number((url.searchParams.get("n") ?? "1").replace(",", "."));
  if (!Number.isInteger(recipeId) || !(amount > 0) || amount > 100_000) return new NextResponse("Not found", { status: 404 });

  const sheet = await buildProductionSheet([{ recipeId, amount }]);
  if (sheet.blocks.length === 0) return new NextResponse("Not found", { status: 404 });
  const theme = await getDefaultPdfTheme();
  const name = sheet.blocks[sheet.blocks.length - 1].name;
  const pdf = await renderProductionPdf(sheet, theme.config, `Production · ${name}`, url.searchParams.get("etapes") === "1");
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="production-${name.replace(/[^a-z0-9\-]/gi, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
