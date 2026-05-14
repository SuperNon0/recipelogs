import Link from "next/link";
import { listAllCategories } from "@/lib/recipes";
import { CategoryManager } from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function CategoriesSettingsPage() {
  const categories = await listAllCategories();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <Link
          href="/settings"
          className="fl-label hover:text-[color:var(--text)]"
          style={{ fontSize: "0.75rem" }}
        >
          ← Paramètres
        </Link>
        <h1 className="fl-title-serif mt-1" style={{ fontSize: "1.6rem" }}>
          🏷️ Catégories
        </h1>
        <p className="fl-label mt-1">
          {categories.length} catégorie{categories.length > 1 ? "s" : ""} ·
          tags secondaires libres pour décrire la recette
        </p>
      </div>

      <section className="fl-card flex flex-col gap-4">
        <CategoryManager categories={categories} />
      </section>
    </div>
  );
}
