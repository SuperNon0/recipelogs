import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import { buildCookbookHtml } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";
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

  const entries: {
    snap: NonNullable<RecipeSnapshot>;
    subrecipeMode: "single" | "separate";
    separateSnaps?: NonNullable<RecipeSnapshot>[];
  }[] = [];

  for (const entry of cookbook.entries) {
    const subrecipeMode = entry.subrecipeMode as "single" | "separate";
    let snap: NonNullable<RecipeSnapshot> | null = null;

    if (entry.linkMode === "snapshot" && entry.snapshotData) {
      snap = entry.snapshotData as unknown as NonNullable<RecipeSnapshot>;
    } else {
      snap = await buildRecipeSnapshot(entry.recipeId);
    }

    if (!snap) continue;

    const entryData: (typeof entries)[number] = { snap, subrecipeMode };

    if (subrecipeMode === "separate" && snap.subRecipes.length > 0) {
      entryData.separateSnaps = await Promise.all(
        snap.subRecipes.map(async (sr) => {
          const childSnap = await buildRecipeSnapshot(
            snap!.subRecipes.find((s) => s.childName === sr.childName)
              ? entry.recipeId
              : entry.recipeId,
          );
          return {
            recipeId: entry.recipeId,
            name: sr.label ?? sr.childName,
            source: null,
            notesTips: null,
            ingredients: sr.ingredients,
            steps: sr.steps,
            totalMassG: sr.totalMassG,
            subRecipes: [],
          } satisfies NonNullable<RecipeSnapshot>;
        }),
      );
    }

    entries.push(entryData);
  }

  const html = buildCookbookHtml({
    cookbookName: cookbook.name,
    description: cookbook.description,
    footer: cookbook.footer,
    hasCover: cookbook.hasCover,
    hasToc: cookbook.hasToc,
    format: cookbook.format as "A4" | "A5",
    entries,
  });

  const pdf = await renderHtmlToPdf(html, cookbook.format as "A4" | "A5");

  const filename = `${cookbook.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
