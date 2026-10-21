import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getShoppingListDetail, listRecipesMinimalForShopping } from "@/lib/shopping";
import { ShoppingListItems } from "@/components/ShoppingListItems";
import { AddRecipeToListPanel } from "@/components/AddRecipeToListPanel";
import { ShoppingListHeaderMenu } from "@/components/ShoppingListMenus";

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
    unit: i.unit,
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

  const checked = items.filter((i) => i.checked).length;
  const sub = [
    `${items.length} article${items.length > 1 ? "s" : ""}`,
    checked > 0 ? `${checked} coché${checked > 1 ? "s" : ""}` : null,
    `${linkedRecipes.length} recette${linkedRecipes.length > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <Link href="/shopping" className="crumb">
        <ChevronLeft size={14} /> Listes de courses
      </Link>
      <div className="page-head">
        <h1>{list.name}</h1>
        <ShoppingListHeaderMenu listId={listId} listName={list.name} checked={checked} />
        <p className="sub">{sub}</p>
      </div>

      <div className="sh-grid">
        <section className="sh-main" aria-label="Articles">
          <ShoppingListItems listId={listId} initialItems={items} />
        </section>
        <aside className="sh-side" aria-label="Recettes de la liste">
          <AddRecipeToListPanel
            listId={listId}
            linkedRecipes={linkedRecipes}
            availableRecipes={availableRecipes}
          />
        </aside>
      </div>
    </>
  );
}
