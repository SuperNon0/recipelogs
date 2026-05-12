import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import {
  buildCoverTocHtml,
  buildRecipesHtml,
  type CookbookEntryUnion,
} from "@/lib/pdf/template";
import { renderHtmlToPdf, mergePdfs } from "@/lib/pdf/renderer";
import { parseTheme } from "@/lib/pdf/theme";
import type { RecipeSnapshot } from "@/lib/cookbooks";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookbookId = Number(id);
  if (isNaN(cookbookId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const cookbook = await getCookbookDetail(cookbookId);
  if (!cookbook) return new NextResponse("Not found", { status: 404 });

  // Fusion des entrées (recettes + chapitres) ordonnée par position
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

    // Le rendu PDF traite désormais TOUJOURS les sous-recettes comme
    // des pages séparées (subrecipeMode est ignoré). On laisse
    // `buildRecipesHtml` les dériver depuis `snap.subRecipes`.
    entries.push({
      type: "recipe",
      snap,
      subrecipeMode: "single",
      sectionTitle: entry.sectionTitle ?? null,
    });
  }

  const theme = parseTheme(cookbook.coverConfig);
  const format = cookbook.format as "A4" | "A5";
  const hasCoverOrToc = cookbook.hasCover || cookbook.hasToc;

  // Pass 1 : couverture + sommaire (sans footer ni numéro de page)
  // Pass 2 : recettes (avec footer + numéro de page commençant à 1)
  // → fusion via pdf-lib pour que la 1ʳᵉ recette affiche bien « 1 ».
  const pdfBuffers: Uint8Array[] = [];

  if (hasCoverOrToc) {
    const coverTocHtml = buildCoverTocHtml({
      cookbookName: cookbook.name,
      description: cookbook.description,
      hasCover: cookbook.hasCover,
      hasToc: cookbook.hasToc,
      format,
      theme,
      entries,
    });
    pdfBuffers.push(await renderHtmlToPdf(coverTocHtml, format, {}));
  }

  if (entries.length > 0) {
    const recipesHtml = buildRecipesHtml({
      format,
      theme,
      entries,
      hasFooter: true,
    });
    pdfBuffers.push(
      await renderHtmlToPdf(recipesHtml, format, {
        footer: cookbook.footer,
        footerAlign: theme.footerAlign,
        showPageNumber: true,
      }),
    );
  }

  const pdf = await mergePdfs(pdfBuffers);

  const filename = `${cookbook.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
