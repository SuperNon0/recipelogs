import Link from "next/link";
import { Plus } from "lucide-react";
import { listShoppingLists } from "@/lib/shopping";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/EmptyState";
import { ShoppingListRow } from "@/components/ShoppingListMenus";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [lists, checkedCounts] = await Promise.all([
    listShoppingLists(),
    prisma.shoppingListItem.groupBy({
      by: ["shoppingListId"],
      where: { checked: true },
      _count: { _all: true },
    }),
  ]);
  const checkedBy = new Map(checkedCounts.map((c) => [c.shoppingListId, c._count._all]));

  return (
    <>
      <div className="page-head">
        <h1>Listes de courses</h1>
        <Link href="/shopping/new" className="fl-btn fl-btn-primary desk-only">
          <Plus size={16} /> Nouvelle liste
        </Link>
        <p className="sub">
          {lists.length} liste{lists.length > 1 ? "s" : ""}
        </p>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          title="Aucune liste"
          description="Crée une liste pour additionner les ingrédients de tes recettes et préparer tes achats."
          ctaHref="/shopping/new"
          ctaLabel="Créer une liste"
        />
      ) : (
        <div className="fl-list">
          {lists.map((l) => (
            <ShoppingListRow
              key={l.id}
              list={{
                id: l.id,
                name: l.name,
                recipeNames: l.recipes.map((r) => r.recipe.name),
                total: l._count.items,
                checked: checkedBy.get(l.id) ?? 0,
              }}
            />
          ))}
        </div>
      )}

      <Link href="/shopping/new" className="fab" aria-label="Créer une liste">
        <Plus size={24} />
      </Link>
    </>
  );
}
