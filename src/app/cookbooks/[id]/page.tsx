import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { getCookbookDetail } from "@/lib/cookbooks";
import { listPdfThemes } from "@/lib/pdfThemes";
import { prisma } from "@/lib/prisma";
import { CookbookEntriesTable, type Entry } from "@/components/CookbookEntriesTable";
import { CookbookConfigForm } from "@/components/CookbookConfigForm";
import { CookbookTabs } from "@/components/CookbookTabs";
import { CookbookMoreButton } from "@/components/CookbookMenu";
import { ShareButton } from "@/components/ShareButton";
import { AddCookbookToShoppingListButton } from "@/components/AddCookbookToShoppingListButton";
import { getActiveToken } from "@/lib/share";
import { SHARE_ENABLED } from "@/lib/features";
import { allPdfFontsHref, parseTheme } from "@/lib/pdf/theme";

export const dynamic = "force-dynamic";

export default async function CookbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookbookId = Number(id);
  if (isNaN(cookbookId)) notFound();

  const [cookbook, shareToken, themes] = await Promise.all([
    getCookbookDetail(cookbookId),
    SHARE_ENABLED ? getActiveToken("cookbook", cookbookId) : null,
    listPdfThemes(),
  ]);

  if (!cookbook) notFound();

  // Photos des recettes (vignettes du tableau).
  const photos = new Map(
    (
      await prisma.recipe.findMany({
        where: { id: { in: cookbook.entries.map((e) => e.recipe.id) } },
        select: { id: true, photoPath: true },
      })
    ).map((r) => [r.id, r.photoPath]),
  );

  const recipeCount = cookbook.entries.length;

  // Recettes et chapitres partagent le même ordre (position).
  const entries: Entry[] = [
    ...cookbook.entries.map((e): Entry => {
      const snap = e.snapshotData as { totalMassG?: number } | null;
      return {
        type: "recipe",
        id: e.id,
        position: e.position,
        recipeId: e.recipe.id,
        recipeName: e.recipe.name,
        photoPath: photos.get(e.recipe.id) ?? null,
        categories: e.recipe.categories.map((rc) => ({
          name: rc.category.name,
          color: rc.category.color,
        })),
        linkMode: e.linkMode as "linked" | "snapshot",
        subrecipeMode: e.subrecipeMode as "single" | "separate",
        sectionTitle: e.sectionTitle ?? null,
        snapshotDate: e.snapshotDate,
        snapshotMassG: e.linkMode === "snapshot" && typeof snap?.totalMassG === "number" ? snap.totalMassG : null,
      };
    }),
    ...cookbook.chapters.map(
      (c): Entry => ({
        type: "chapter",
        id: c.id,
        position: c.position,
        title: c.title,
        intro: c.intro,
      }),
    ),
  ].sort((a, b) => a.position - b.position);

  const fonts = allPdfFontsHref();
  const chapterCount = cookbook.chapters.length;

  return (
    <div>
      {fonts && <link rel="stylesheet" href={fonts} />}
      <Link href="/cookbooks" className="crumb">
        <ChevronLeft size={14} /> Cahiers
      </Link>
      <div className="page-head">
        <h1 style={{ minWidth: 180 }}>{cookbook.name}</h1>
        <span className="desk-only">
          <AddCookbookToShoppingListButton cookbookId={cookbookId} cookbookName={cookbook.name} recipeCount={recipeCount} />
        </span>
        {SHARE_ENABLED && (
          <ShareButton entityType="cookbook" entityId={cookbookId} existingToken={shareToken?.token ?? null} />
        )}
        <a href={`/cookbooks/${cookbookId}/pdf`} className="fl-btn fl-btn-primary">
          <Download size={16} /> <span className="desk-only">Télécharger le PDF</span>
          <span className="mob-only">PDF</span>
        </a>
        <CookbookMoreButton id={cookbookId} name={cookbook.name} recipeCount={recipeCount} />
        <p className="sub">
          {recipeCount} recette{recipeCount > 1 ? "s" : ""}
          {chapterCount > 0 ? ` · ${chapterCount} chapitre${chapterCount > 1 ? "s" : ""}` : ""} · {cookbook.format}
          {cookbook.description ? ` · ${cookbook.description}` : ""}
        </p>
      </div>

      <CookbookTabs
        recipeCount={recipeCount}
        recipes={<CookbookEntriesTable cookbookId={cookbookId} initial={entries} />}
        apparence={
          <CookbookConfigForm
            cookbookId={cookbookId}
            defaultValues={{
              name: cookbook.name,
              description: cookbook.description ?? "",
              format: cookbook.format,
              hasToc: cookbook.hasToc,
              hasCover: cookbook.hasCover,
              hasLogo: cookbook.hasLogo,
              footer: cookbook.footer ?? "",
            }}
            defaultTheme={parseTheme(cookbook.coverConfig)}
            themes={themes.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              format: t.format,
              isDefault: t.isDefault,
              config: t.config,
            }))}
          />
        }
      />
    </div>
  );
}
