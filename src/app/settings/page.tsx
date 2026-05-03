import { listAllCategories } from "@/lib/recipes";
import { CategoryManager } from "@/components/CategoryManager";
import { RecipeKeeperImport } from "@/components/RecipeKeeperImport";
import { DeployButton } from "@/components/DeployButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const categories = await listAllCategories();

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Paramètres
      </h1>

      {/* Mise à jour */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Mise à jour du site
          </h2>
          <p className="fl-label mt-1">
            Récupère les dernières évolutions depuis GitHub
          </p>
        </div>
        <DeployButton />
      </section>

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

      {/* Import Recipe Keeper */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            Import Recipe Keeper
          </h2>
          <p className="fl-label mt-1">Importer un export CSV de Recipe Keeper</p>
        </div>
        <RecipeKeeperImport />
      </section>

      {/* À venir */}
      <section className="fl-card">
        <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
          À venir
        </h2>
        <ul className="flex flex-col gap-2 text-sm text-[color:var(--muted)]">
          <li>· Mode de saisie des ingrédients (base réutilisable)</li>
          <li>· Logo personnel pour les cahiers PDF</li>
          <li>· Export JSON des données</li>
        </ul>
      </section>
    </div>
  );
}
