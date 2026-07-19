import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import {
  buildCookbookHtml,
  type CookbookEntryUnion,
  type RecipeSnap,
} from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";
import { parseTheme } from "@/lib/pdf/theme";
import type { RecipeSnapshot } from "@/lib/cookbooks";

/**
 * Rend le PDF avec un thème temporaire fourni dans le body (non sauvegardé).
 * Utilisé par le composant CookbookPreview pour montrer l'aperçu exact.
 *
 * POST body :
 *   {
 *     theme: <CookbookTheme JSON>,        (optionnel — sinon celui du cahier)
 *     name: string,                        (surcharge le nom pour la couverture)
 *     description: string,                 (surcharge la description)
 *     hasCover: bool, hasToc: bool,
 *     footer: string, format: "A4"|"A5"
 *   }
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

  let overrides: {
    theme?: unknown;
    name?: string;
    description?: string;
    hasCover?: boolean;
    hasToc?: boolean;
    footer?: string;
    format?: "A4" | "A5";
  } = {};
  try {
    overrides = await req.json();
  } catch {
    // ignore body parse errors → utilise les valeurs sauvegardées
  }

  type SnapEntry = NonNullable<RecipeSnapshot>;

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
    let snap: SnapEntry | null = null;
    if (entry.linkMode === "snapshot" && entry.snapshotData) {
      snap = entry.snapshotData as unknown as SnapEntry;
    } else {
      snap = await buildRecipeSnapshot(entry.recipeId);
    }
    if (!snap) continue;

    const recipeEntry: Extract<CookbookEntryUnion, { type: "recipe" }> = {
      type: "recipe",
      snap: snap as unknown as RecipeSnap,
      subrecipeMode,
      grouped: entry.groupWithPrevious === true,
      sectionTitle: entry.sectionTitle ?? null,
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

  // Applique le thème depuis le body si fourni, sinon celui sauvegardé
  const theme = parseTheme(overrides.theme ?? cookbook.coverConfig);
  const name = overrides.name ?? cookbook.name;
  const description = overrides.description ?? cookbook.description ?? "";
  const hasCover = overrides.hasCover ?? cookbook.hasCover;
  const hasToc = overrides.hasToc ?? cookbook.hasToc;
  const footer = overrides.footer ?? cookbook.footer ?? "";
  const format = (overrides.format ?? cookbook.format) as "A4" | "A5";

  const html = buildCookbookHtml({
    cookbookName: name,
    description,
    hasCover,
    hasToc,
    format,
    theme,
    entries,
  });

  const pdf = await renderHtmlToPdf(html, format, {
    footer,
    footerAlign: theme.footerAlign,
    showPageNumbers: theme.showPageNumbers,
  });

  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      // Pas de download, on veut inline dans l'iframe
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
