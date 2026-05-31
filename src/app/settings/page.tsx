import Link from "next/link";
import { listAllCategories, listAllFolders, listAllIngredientBases } from "@/lib/recipes";
import { RecipeKeeperImport } from "@/components/RecipeKeeperImport";
import { DeployButton } from "@/components/DeployButton";
import { RecipePdfSettingsForm } from "@/components/RecipePdfSettingsForm";
import { getRecipePdfSettings, getSiteUrl, saveSiteUrl } from "@/app/actions/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, folders, ingredientBases, recipePdfSettings, siteUrl] =
    await Promise.all([
      listAllCategories(),
      listAllFolders(),
      listAllIngredientBases(),
      getRecipePdfSettings(),
      getSiteUrl(),
    ]);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Paramètres
      </h1>

      {/* Mise à jour */}
      <section className="fl-card flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
              Mise à jour du site
            </h2>
            <p className="fl-label mt-1">
              Récupère les dernières évolutions depuis GitHub
            </p>
          </div>
          <Link
            href="/whats-new"
            className="fl-btn fl-btn-secondary"
            style={{ fontSize: "0.8rem", whiteSpace: "nowrap" }}
          >
            📋 Nouveautés
          </Link>
        </div>
        <DeployButton />
      </section>

      {/* Lien du logo */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            🔗 Lien du logo
          </h2>
          <p className="fl-label mt-1">
            URL ouverte quand tu cliques sur le logo depuis l&apos;accueil · laisse vide
            pour désactiver
          </p>
        </div>
        <form action={saveSiteUrl} className="flex gap-2 flex-wrap">
          <input
            name="siteUrl"
            type="url"
            defaultValue={siteUrl ?? ""}
            placeholder="https://mon-site.com"
            className="fl-input flex-1"
            style={{ fontSize: "0.9rem", minWidth: 200 }}
          />
          <button
            type="submit"
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.85rem" }}
          >
            Enregistrer
          </button>
        </form>
      </section>

      {/* Dossiers */}
      <Link
        href="/settings/folders"
        className="fl-card flex items-center justify-between gap-4 hover:border-[color:var(--muted)] transition-colors"
      >
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            📁 Dossiers
          </h2>
          <p className="fl-label mt-1">
            {folders.length} dossier{folders.length > 1 ? "s" : ""} · une recette
            peut être rangée dans 0 ou 1 dossier
          </p>
        </div>
        <span className="fl-label" style={{ fontSize: "1.1rem", flexShrink: 0 }}>→</span>
      </Link>

      {/* Catégories */}
      <Link
        href="/settings/categories"
        className="fl-card flex items-center justify-between gap-4 hover:border-[color:var(--muted)] transition-colors"
      >
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            🏷️ Catégories
          </h2>
          <p className="fl-label mt-1">
            {categories.length} catégorie{categories.length > 1 ? "s" : ""} ·
            tags secondaires libres pour décrire la recette
          </p>
        </div>
        <span className="fl-label" style={{ fontSize: "1.1rem", flexShrink: 0 }}>→</span>
      </Link>

      {/* Ingrédients */}
      <Link
        href="/settings/ingredients"
        className="fl-card flex items-center justify-between gap-4 hover:border-[color:var(--muted)] transition-colors"
      >
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            🧂 Ingrédients
          </h2>
          <p className="fl-label mt-1">
            {ingredientBases.length} ingrédient{ingredientBases.length > 1 ? "s" : ""} dans
            la base · autocomplétion à la saisie des recettes
          </p>
        </div>
        <span className="fl-label" style={{ fontSize: "1.1rem", flexShrink: 0 }}>→</span>
      </Link>

      {/* PDF d'une recette seule */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            PDF d&apos;une recette
          </h2>
          <p className="fl-label mt-1">
            Style appliqué quand tu télécharges le PDF d&apos;une recette individuelle
          </p>
        </div>
        <RecipePdfSettingsForm initial={recipePdfSettings} />
      </section>

      {/* Import JSON */}
      <Link
        href="/settings/import-json"
        className="fl-card flex items-center justify-between gap-4 hover:border-[color:var(--muted)] transition-colors"
      >
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            📥 Import JSON
          </h2>
          <p className="fl-label mt-1">
            Importer des recettes depuis un fichier JSON structuré
          </p>
        </div>
        <span className="fl-label" style={{ fontSize: "1.1rem", flexShrink: 0 }}>→</span>
      </Link>

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
