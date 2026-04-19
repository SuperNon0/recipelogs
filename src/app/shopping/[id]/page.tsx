import Link from "next/link";
import { notFound } from "next/navigation";
import { getShoppingListDetail, listRecipesMinimalForShopping } from "@/lib/shopping";
import { ShoppingListItems } from "@/components/ShoppingListItems";
import { AddRecipeToListPanel } from "@/components/AddRecipeToListPanel";
import { DeleteShoppingListButton } from "@/components/DeleteShoppingListButton";

export const dynamic = "force-dynamic";

export default async function ShoppingListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listId = Number(id);
  if (isNaN(listId)) notFound();

  const [list, allRecipes] = await Promise.all([
    getShoppingListDetail(listId),
    listRecipesMinimalForShopping(),
  ]);

  if (!list) notFound();

  const items = list.items.map((i) => ({
    id: i.id,
    name: i.name,
    quantityG: i.quantityG ? Number(i.quantityG) : null,
    checked: i.checked,
    recipeId: i.recipeId,
  }));

  const linkedRecipes = list.recipes.map((r) => ({
    recipeId: r.recipeId,
    name: r.recipe.name,
    coefficient: Number(r.coefficient),
  }));

  const availableRecipes = allRecipes.filter(
    (r) => !linkedRecipes.some((lr) => lr.recipeId === r.id),
  );

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/shopping" className="fl-label hover:text-[color:var(--text)]">
            ← Listes
          </Link>
          <h1 className="fl-title-serif mt-1" style={{ fontSize: "1.6rem" }}>
            {list.name}
          </h1>
        </div>
      </div>

      {/* Recettes liées */}
      <section>
        <h2 className="fl-label mb-3" style={{ fontSize: "0.9rem", color: "var(--text)" }}>
          Recettes ({linkedRecipes.length})
        </h2>
        <AddRecipeToListPanel
          listId={listId}
          linkedRecipes={linkedRecipes}
          availableRecipes={availableRecipes}
        />
      </section>

      {/* Articles */}
      <section>
        <h2 className="fl-label mb-3" style={{ fontSize: "0.9rem", color: "var(--text)" }}>
          Articles ({items.length})
        </h2>
        <ShoppingListItems listId={listId} initialItems={items} />
      </section>

      {/* Zone dangereuse */}
      <section>
        <h2 className="fl-label mb-3" style={{ fontSize: "0.9rem", color: "var(--danger)" }}>
          Zone dangereuse
        </h2>
        <div className="fl-card" style={{ borderColor: "var(--danger-muted, #3a1a1a)" }}>
          <p className="text-sm text-[color:var(--muted)] mb-3">
            La suppression est irréversible.
          </p>
          <DeleteShoppingListButton listId={listId} listName={list.name} />
        </div>
      </section>
    </div>
  );
}
