import { NextResponse } from "next/server";
import { getCookbookDetail } from "@/lib/cookbooks";
import { loadCookbookEntries, renderCookbookPdf } from "@/lib/pdf/cookbookPdf";
import { parseTheme, cookbookThemeSchema } from "@/lib/pdf/theme";

/**
 * Génère un PDF d'aperçu en utilisant la configuration NON enregistrée
 * envoyée dans le corps de la requête (theme, name, options de cahier).
 * Les entrées (recettes + chapitres) sont lues depuis la BDD telles quelles.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookbookId = Number(id);
  if (isNaN(cookbookId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cookbook = await getCookbookDetail(cookbookId);
  if (!cookbook) return new NextResponse("Not found", { status: 404 });

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    payload = {};
  }

  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name
    : cookbook.name;
  const description = typeof payload.description === "string"
    ? payload.description
    : (cookbook.description ?? "");
  const format = (payload.format === "A5" ? "A5" : "A4") as "A4" | "A5";
  const hasCover = payload.hasCover !== undefined
    ? !!payload.hasCover
    : cookbook.hasCover;
  const hasToc = payload.hasToc !== undefined
    ? !!payload.hasToc
    : cookbook.hasToc;
  const footer = typeof payload.footer === "string"
    ? payload.footer
    : (cookbook.footer ?? "");

  const themeParsed = cookbookThemeSchema.safeParse(payload.theme);
  const theme = themeParsed.success
    ? themeParsed.data
    : parseTheme(payload.theme ?? cookbook.coverConfig);

  const entries = await loadCookbookEntries(cookbook);

  if (entries.length === 0) {
    entries.push({
      type: "recipe",
      snap: {
        name: "Recette d'exemple",
        source: "Aperçu",
        notesTips: null,
        rating: null,
        photoPath: null,
        tags: ["Aperçu"],
        categories: ["Démo"],
        ingredients: [
          { name: "Farine", quantityG: 250 },
          { name: "Sucre", quantityG: 100 },
          { name: "Beurre", quantityG: 125 },
          { name: "Œufs", quantityG: 50 },
        ],
        steps:
          "Mélanger les ingrédients secs.\nIncorporer le beurre fondu.\nAjouter les œufs.\nEnfourner 25 min à 180°C.",
        totalMassG: 525,
        subRecipes: [],
      },
      subrecipeMode: "single",
      sectionTitle: null,
    });
  }

  const pdf = await renderCookbookPdf({
    name,
    description,
    hasCover,
    hasToc,
    format,
    theme,
    footer,
    entries,
  });
  if (!pdf) return new NextResponse("Aperçu vide", { status: 400 });

  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    },
  });
}
