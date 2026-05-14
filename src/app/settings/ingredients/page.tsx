import Link from "next/link";
import { listAllIngredientBases } from "@/lib/recipes";
import { IngredientBaseManager } from "@/components/IngredientBaseManager";

export const dynamic = "force-dynamic";

export default async function IngredientsSettingsPage() {
  const ingredientBases = await listAllIngredientBases();

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
          🧂 Ingrédients
        </h1>
        <p className="fl-label mt-1">
          {ingredientBases.length} ingrédient{ingredientBases.length > 1 ? "s" : ""} dans
          la base · ajoutés automatiquement à chaque création ou modification de recette
        </p>
      </div>

      <section className="fl-card flex flex-col gap-4">
        <IngredientBaseManager ingredientBases={ingredientBases} />
      </section>
    </div>
  );
}
