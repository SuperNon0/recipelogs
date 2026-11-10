import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getIngredientBaseDetail, listAllIngredientBases } from "@/lib/recipes";
import { IngredientDetailClient } from "@/components/IngredientDetailClient";
import { requirePage } from "@/lib/auth/guard";
import { viewerCan } from "@/lib/auth/viewer";
import { productChoicesFor } from "@/lib/purchaseOrders";

export const dynamic = "force-dynamic";

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requirePage("organize.edit");
  const { id } = await params;
  const baseId = Number(id);
  if (!Number.isFinite(baseId)) notFound();

  const [detail, allBases] = await Promise.all([
    getIngredientBaseDetail(baseId),
    listAllIngredientBases(),
  ]);
  if (!detail) notFound();

  const otherBases = allBases.filter((b) => b.id !== baseId);
  const showCosts = viewerCan(viewer, "costs.view");
  const choice = showCosts ? ((await productChoicesFor([detail.base.name])).find((c) => c.baseId === baseId) ?? null) : null;

  return (
    <div className="set-page">
      <Link href="/settings/ingredients" className="crumb">
        <ChevronLeft size={14} /> Ingrédients
      </Link>
      <IngredientDetailClient
        base={
          showCosts
            ? detail.base
            : { ...detail.base, price: null, priceHistory: [] }
        }
        recipes={detail.recipes}
        viaRecipes={detail.viaRecipes}
        otherBases={otherBases.map((b) => ({ id: b.id, name: b.name, count: b._count.usages }))}
        productChoice={showCosts ? choice : undefined}
      />
    </div>
  );
}
