import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import { buildCookbookHtml, type CookbookEntryUnion } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";
import { parseTheme } from "@/lib/pdf/theme";
import type { RecipeSnapshot } from "@/lib/cookbooks";

type SnapEntry = NonNullable<RecipeSnapshot>;

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
    const subrecipeMode = entry.subrecipeMode as "single" | "separate";
    let snap: NonNullable<RecipeSnapshot> | null = null;

    if (entry.linkMode === "snapshot" && entry.snapshotData) {
      snap = entry.snapshotData as unknown as NonNullable<RecipeSnapshot>;
    } else {
      snap = await buildRecipeSnapshot(entry.recipeId);
    }

    if (!snap) continue;

    const grouped = entry.groupWithPrevious === true;
    const sectionTitle = entry.sectionTitle ?? null;

    const recipeEntry: Extract<CookbookEntryUnion, { type: "recipe" }> = {
      type: "recipe",
      snap,
      subrecipeMode,
      grouped,
      sectionTitle,
    };

    if (subrecipeMode === "separate" && snap.subRecipes.length > 0) {
      recipeEntry.separateSnaps = snap.subRecipes.map(
        (sr): SnapEntry => ({
          recipeId: entry.recipeId,
          name: sr.label ?? sr.childName,
          source: null,
          notesTips: null,
          rating: null,
          photoPath: null,
          tags: [],
          categories: [],
          ingredients: sr.ingredients,
          steps: sr.steps,
          totalMassG: sr.totalMassG,
          subRecipes: [],
          multiplier: 1,
        }),
      );
    }

    entries.push(recipeEntry);
  }

  const theme = parseTheme(cookbook.coverConfig);

  const html = buildCookbookHtml({
    cookbookName: cookbook.name,
    description: cookbook.description,
    hasCover: cookbook.hasCover,
    hasToc: cookbook.hasToc,
    format: cookbook.format as "A4" | "A5",
    theme,
    entries,
  });

  const pdf = await renderHtmlToPdf(html, cookbook.format as "A4" | "A5", {
    footer: cookbook.footer,
  });

  const filename = `${cookbook.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
