import { NextResponse } from "next/server";
import { getCookbookDetail, buildRecipeSnapshot } from "@/lib/cookbooks";
import { buildCookbookHtml, type CookbookEntryUnion } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";
import { parseTheme, cookbookThemeSchema } from "@/lib/pdf/theme";
import type { RecipeSnapshot } from "@/lib/cookbooks";

type SnapEntry = NonNullable<RecipeSnapshot>;

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

  // Payload depuis le client : on tolère un objet partiel.
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

  // Theme : on tente de valider strictement, sinon on retombe sur le tolérant.
  const themeParsed = cookbookThemeSchema.safeParse(payload.theme);
  const theme = themeParsed.success
    ? themeParsed.data
    : parseTheme(payload.theme ?? cookbook.coverConfig);

  // Reconstruction des entrées (mêmes données que la route PDF complète).
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

    const recipeEntry: Extract<CookbookEntryUnion, { type: "recipe" }> = {
      type: "recipe",
      snap,
      subrecipeMode,
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

  // Si le cahier est vide, on ajoute une recette d'exemple pour que l'aperçu
  // ne soit pas une page blanche.
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
  });

  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-store",
    },
  });
}
