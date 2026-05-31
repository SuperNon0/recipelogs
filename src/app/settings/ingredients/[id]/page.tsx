import Link from "next/link";
import { notFound } from "next/navigation";
import { getIngredientBaseDetail, listAllIngredientBases } from "@/lib/recipes";
import { IngredientDetailClient } from "@/components/IngredientDetailClient";

export const dynamic = "force-dynamic";

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const baseId = Number(id);
  if (!Number.isFinite(baseId)) notFound();

  const [detail, allBases] = await Promise.all([
    getIngredientBaseDetail(baseId),
    listAllIngredientBases(),
  ]);
  if (!detail) notFound();

  const otherBases = allBases.filter((b) => b.id !== baseId);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <Link
          href="/settings/ingredients"
          className="fl-label hover:text-[color:var(--text)]"
          style={{ fontSize: "0.75rem" }}
        >
          ← Ingrédients
        </Link>
        <h1 className="fl-title-serif mt-1" style={{ fontSize: "1.6rem" }}>
          🧂 {detail.base.name}
        </h1>
        <p className="fl-label mt-1">
          {detail.recipes.length} recette{detail.recipes.length > 1 ? "s" : ""} utilisent cet ingrédient
        </p>
      </div>

      <IngredientDetailClient
        base={detail.base}
        recipes={detail.recipes}
        otherBases={otherBases.map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
