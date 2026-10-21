import { NextResponse } from "next/server";
import { cookbookThemeSchema, parseTheme } from "@/lib/pdf/theme";
import { previewSnap, renderRecipePdf } from "@/lib/pdf/recipePdf";

/**
 * Aperçu d'un thème en cours de modification (pas encore enregistré).
 * Corps : { config, format, recipeId? } → PDF de la recette choisie, ou d'une
 * recette récente, ou de la recette d'exemple.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const parsed = cookbookThemeSchema.safeParse(body.config);
  const theme = parsed.success ? parsed.data : parseTheme(body.config);
  const format = body.format === "A5" ? "A5" : "A4";
  const recipeId = Number(body.recipeId);
  const snap = await previewSnap(Number.isInteger(recipeId) && recipeId > 0 ? recipeId : null);
  const pdf = await renderRecipePdf(snap, theme, format);
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" },
  });
}
