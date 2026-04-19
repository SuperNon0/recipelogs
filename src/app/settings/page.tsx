import { listAllCategories } from "@/lib/recipes";
import { CategoryManager } from "@/components/CategoryManager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const categories = await listAllCategories();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Paramètres
      </h1>

      {/* Catégories */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Catégories
          </h2>
          <p className="fl-label mt-1">
            {categories.length} catégorie{categories.length > 1 ? "s" : ""}
          </p>
        </div>
        <CategoryManager categories={categories} />
      </section>

      {/* À venir */}
      <section className="fl-card">
        <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
          À venir
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
          <li>· Mode de saisie des ingrédients (A libre / B base réutilisable)</li>
          <li>· Logo personnel pour les cahiers PDF</li>
          <li>· Export & import JSON des données</li>
        </ul>
      </section>
    </div>
  );
}
