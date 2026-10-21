import { NextResponse } from "next/server";
import { buildRecipeSnapshot } from "@/lib/cookbooks";
import { renderRecipePdf } from "@/lib/pdf/recipePdf";
import { getDefaultPdfTheme, getPdfTheme } from "@/lib/pdfThemes";

/**
 * PDF d'une recette.
 *  - ?theme=ID : thème à utiliser (sinon le thème par défaut)
 *  - ?inline=1 : affichage dans la page (aperçu) au lieu d'un téléchargement
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const recipeId = Number(id);
  if (!Number.isInteger(recipeId)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(req.url);
  const themeId = Number(url.searchParams.get("theme"));
  const inline = url.searchParams.get("inline") === "1";

  const snap = await buildRecipeSnapshot(recipeId);
  if (!snap) return new NextResponse("Not found", { status: 404 });

  const theme = (Number.isInteger(themeId) && themeId > 0 ? await getPdfTheme(themeId) : null)
    ?? (await getDefaultPdfTheme());
  const pdf = await renderRecipePdf(snap, theme.config, theme.format);

  const filename = `${snap.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
