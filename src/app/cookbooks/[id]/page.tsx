import Link from "next/link";
import { notFound } from "next/navigation";
import { getCookbookDetail, listPdfTemplates } from "@/lib/cookbooks";
import { CookbookEntryRow } from "@/components/CookbookEntryRow";
import { CookbookConfigForm } from "@/components/CookbookConfigForm";
import { DeleteCookbookButton } from "@/components/DeleteCookbookButton";

export const dynamic = "force-dynamic";

export default async function CookbookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookbookId = Number(id);
  if (isNaN(cookbookId)) notFound();

  const [cookbook, templates] = await Promise.all([
    getCookbookDetail(cookbookId),
    listPdfTemplates(),
  ]);

  if (!cookbook) notFound();

  const entries = cookbook.entries.map((e, idx) => ({
    id: e.id,
    position: e.position,
    recipeName: e.recipe.name,
    recipeId: e.recipe.id,
    linkMode: e.linkMode as "linked" | "snapshot",
    subrecipeMode: e.subrecipeMode as "single" | "separate",
    snapshotDate: e.snapshotDate,
  }));

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <Link
            href="/cookbooks"
            className="fl-label hover:text-[color:var(--text)]"
          >
            ← Cahiers
          </Link>
          <h1
            className="fl-title-serif mt-1"
            style={{ fontSize: "1.6rem" }}
          >
            {cookbook.name}
          </h1>
          {cookbook.description && (
            <p className="text-[color:var(--muted)] text-sm mt-1">
              {cookbook.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={`/cookbooks/${cookbookId}/pdf`}
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.8rem" }}
          >
            ⬇ Télécharger PDF
          </a>
        </div>
      </div>

      {/* Entries */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="fl-label" style={{ fontSize: "0.9rem", color: "var(--text)" }}>
            Recettes ({entries.length})
          </h2>
        </div>

        {entries.length === 0 ? (
          <div className="fl-card text-center py-8">
            <p className="text-[color:var(--muted)] text-sm">
              Aucune recette dans ce cahier.
            </p>
            <p className="text-[color:var(--muted)] text-xs mt-1">
              Ajoutez des recettes depuis la fiche recette.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((entry, idx) => (
              <CookbookEntryRow
                key={entry.id}
                cookbookId={cookbookId}
                entry={entry}
                isFirst={idx === 0}
                isLast={idx === entries.length - 1}
              />
            ))}
          </div>
        )}
      </section>

      {/* Config */}
      <section>
        <h2 className="fl-label mb-3" style={{ fontSize: "0.9rem", color: "var(--text)" }}>
          Configuration
        </h2>
        <CookbookConfigForm
          cookbookId={cookbookId}
          defaultValues={{
            name: cookbook.name,
            description: cookbook.description ?? "",
            format: cookbook.format,
            templateId: cookbook.templateId,
            hasToc: cookbook.hasToc,
            hasCover: cookbook.hasCover,
            hasLogo: cookbook.hasLogo,
            footer: cookbook.footer ?? "",
          }}
          templates={templates}
        />
      </section>

      {/* Danger zone */}
      <section>
        <h2 className="fl-label mb-3" style={{ fontSize: "0.9rem", color: "var(--danger)" }}>
          Zone dangereuse
        </h2>
        <div className="fl-card" style={{ borderColor: "var(--danger-muted, #3a1a1a)" }}>
          <p className="text-sm text-[color:var(--muted)] mb-3">
            La suppression du cahier est irréversible. Les recettes ne sont pas supprimées.
          </p>
          <DeleteCookbookButton cookbookId={cookbookId} cookbookName={cookbook.name} />
        </div>
      </section>
    </div>
  );
}
