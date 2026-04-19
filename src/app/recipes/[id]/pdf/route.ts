import { NextResponse } from "next/server";
import { buildRecipeSnapshot } from "@/lib/cookbooks";
import { buildSingleRecipeHtml } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const recipeId = Number(id);
  if (isNaN(recipeId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const snap = await buildRecipeSnapshot(recipeId);
  if (!snap) return new NextResponse("Not found", { status: 404 });

  const html = buildSingleRecipeHtml(snap, "A4");
  const pdf = await renderHtmlToPdf(html, "A4");

  const filename = `${snap.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
