import Link from "next/link";
import { listShoppingLists } from "@/lib/shopping";
import { Fab } from "@/components/Fab";
import { EmptyState } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const lists = await listShoppingLists();

  return (
    <>
      <div className="flex items-baseline justify-between mb-5">
        <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
          Listes de courses
        </h1>
        <span className="fl-label">
          {lists.length} liste{lists.length > 1 ? "s" : ""}
        </span>
      </div>

      {lists.length === 0 ? (
        <EmptyState
          title="Aucune liste"
          description="Créez une liste pour agréger les ingrédients de vos recettes et préparer vos achats."
          ctaHref="/shopping/new"
          ctaLabel="Créer une liste"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((l) => {
            const total = l._count.items;
            const checked = 0; // non chargé dans la liste — affiché uniquement dans le détail
            return (
              <Link
                key={l.id}
                href={`/shopping/${l.id}`}
                className="fl-card flex flex-col gap-3 hover:border-[color:var(--muted)] transition-colors"
              >
                <h3 className="fl-title-serif" style={{ fontSize: "1.15rem" }}>
                  {l.name}
                </h3>
                {l.recipes.length > 0 && (
                  <p className="text-[color:var(--muted)] text-xs line-clamp-2">
                    {l.recipes.map((r) => r.recipe.name).join(", ")}
                  </p>
                )}
                <div className="flex items-end justify-between mt-auto">
                  <div>
                    <span className="fl-label">Articles</span>
                    <div className="fl-value-serif" style={{ fontSize: "1.55rem" }}>
                      {total}
                    </div>
                  </div>
                  {total > 0 && (
                    <span className="fl-tag">
                      {total} article{total > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Fab href="/shopping/new" label="Créer une liste" />
    </>
  );
}
