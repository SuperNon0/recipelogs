import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import {
  buildCoverTocHtml,
  buildRecipesHtml,
  type CookbookEntryUnion,
} from "@/lib/pdf/template";
import { renderHtmlToPdf, mergePdfs } from "@/lib/pdf/renderer";
import { parseTheme, cookbookThemeSchema } from "@/lib/pdf/theme";
import type { RecipeSnapshot } from "@/lib/cookbooks";

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

  type RawEntry =
    | { kind: "recipe"; data: (typeof cookbook.entries)[number] }
    | { kind: "chapter"; data: (typeof cookbook.chapters)[number] };

  const allRaw: RawEntry[] = [
    ...cookbook.entries.map((e) => ({ kind: "recipe" as const, data: e })),
    ...cookbook.chapters.map((c) => ({ kind: "chapter" as const, data: c })),
  ].sort((a, b) => a.data.position - b.data.position);

  const entries: CookbookEntryUnion[] = [];

  for (const raw of allRaw) {
    if (raw.kind === "chapter") {
      entries.push({
        type: "chapter",
        title: raw.data.title,
        intro: raw.data.intro ?? "",
      });
      continue;
    }

    const entry = raw.data;
    let snap: NonNullable<RecipeSnapshot> | null = null;

    if (entry.linkMode === "snapshot" && entry.snapshotData) {
      snap = entry.snapshotData as unknown as NonNullable<RecipeSnapshot>;
    } else {
      snap = await buildRecipeSnapshot(entry.recipeId);
    }
    if (!snap) continue;

    // Sous-recettes toujours rendues sur leur propre page : pas besoin de
    // construire `separateSnaps` ici, `buildRecipesHtml` le fait à partir
    // de `snap.subRecipes`.
    entries.push({
      type: "recipe",
      snap,
      subrecipeMode: "single",
      sectionTitle: entry.sectionTitle ?? null,
    });
  }

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

  const hasCoverOrToc = hasCover || hasToc;

  const pdfBuffers: Uint8Array[] = [];

  if (hasCoverOrToc) {
    const coverTocHtml = buildCoverTocHtml({
      cookbookName: name,
      description,
      hasCover,
      hasToc,
      format,
      theme,
      entries,
    });
    pdfBuffers.push(await renderHtmlToPdf(coverTocHtml, format, {}));
  }

  const recipesHtml = buildRecipesHtml({
    format,
    theme,
    entries,
    hasFooter: true,
  });
  pdfBuffers.push(
    await renderHtmlToPdf(recipesHtml, format, {
      footer,
      footerAlign: theme.footerAlign,
      showPageNumber: true,
    }),
  );

  const pdf = await mergePdfs(pdfBuffers);

  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    },
  });
}
