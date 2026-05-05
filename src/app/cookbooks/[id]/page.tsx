import Link from "next/link";
import { notFound } from "next/navigation";
import { getCookbookDetail } from "@/lib/cookbooks";
import {
  CookbookEntriesTable,
  type Entry,
} from "@/components/CookbookEntriesTable";
import { CookbookConfigForm } from "@/components/CookbookConfigForm";
import { CookbookTabs } from "@/components/CookbookTabs";
import { DeleteCookbookButton } from "@/components/DeleteCookbookButton";
import { ShareButton } from "@/components/ShareButton";
import { getActiveToken } from "@/lib/share";
import { parseTheme } from "@/lib/pdf/theme";

export const dynamic = "force-dynamic";

export default async function CookbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookbookId = Number(id);
  if (isNaN(cookbookId)) notFound();

  const [cookbook, shareToken] = await Promise.all([
    getCookbookDetail(cookbookId),
    getActiveToken("cookbook", cookbookId),
  ]);

  if (!cookbook) notFound();

  // Fusion des recettes et chapitres dans une liste ordonnée par position
  const entries: Entry[] = [
    ...cookbook.entries.map(
      (e): Entry => ({
        type: "recipe",
        id: e.id,
        position: e.position,
        recipeId: e.recipe.id,
        recipeName: e.recipe.name,
        categories: e.recipe.categories.map((rc) => ({
          name: rc.category.name,
          color: rc.category.color,
        })),
        linkMode: e.linkMode as "linked" | "snapshot",
        subrecipeMode: e.subrecipeMode as "single" | "separate",
        groupWithPrevious: e.groupWithPrevious ?? false,
        sectionTitle: e.sectionTitle ?? null,
        snapshotDate: e.snapshotDate,
      }),
    ),
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

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <Link
            href="/cookbooks"
            className="fl-label hover:text-[color:var(--text)]"
          >
            ← Cahiers
          </Link>
          <h1 className="fl-title-serif mt-1" style={{ fontSize: "1.6rem" }}>
            {cookbook.name}
          </h1>
          {cookbook.description && (
            <p className="text-[color:var(--muted)] text-sm mt-1">
              {cookbook.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <ShareButton
            entityType="cookbook"
            entityId={cookbookId}
            existingToken={shareToken?.token ?? null}
          />
          <a
            href={`/cookbooks/${cookbookId}/pdf`}
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.8rem" }}
          >
            ⬇ Télécharger PDF
          </a>
        </div>
      </div>

      {/* 2 onglets : Recettes / Apparence */}
      <CookbookTabs
        recipes={
          <div className="flex flex-col gap-6">
            <CookbookEntriesTable
              cookbookId={cookbookId}
              initial={entries}
            />

            <section>
              <h2
                className="fl-label mb-3"
                style={{ fontSize: "0.9rem", color: "var(--danger)" }}
              >
                Zone dangereuse
              </h2>
              <div
                className="fl-card"
                style={{ borderColor: "var(--danger-muted, #3a1a1a)" }}
              >
                <p className="text-sm text-[color:var(--muted)] mb-3">
                  La suppression du cahier est irréversible. Les recettes ne sont
                  pas supprimées.
                </p>
                <DeleteCookbookButton
                  cookbookId={cookbookId}
                  cookbookName={cookbook.name}
                />
              </div>
            </section>
          </div>
        }
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
          />
        }
      />
    </div>
  );
}
