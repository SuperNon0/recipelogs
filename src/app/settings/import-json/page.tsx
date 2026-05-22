import Link from "next/link";
import { JsonRecipeImport } from "@/components/JsonRecipeImport";
import { ConversionPromptSection } from "@/components/ConversionPromptSection";

export const dynamic = "force-dynamic";

export default function ImportJsonPage() {
  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/settings" className="fl-label hover:text-[color:var(--text)]">
          ← Paramètres
        </Link>
      </div>

      <h1 className="fl-title-serif" style={{ fontSize: "1.6rem" }}>
        Import JSON
      </h1>

      {/* Import du fichier */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            📥 Importer des recettes depuis un fichier JSON
          </h2>
          <p className="fl-label mt-1">
            Charge un fichier JSON exporté depuis RecipeLog ou converti depuis un autre format.
            Les recettes déjà existantes (même nom) sont ignorées.
          </p>
        </div>
        <JsonRecipeImport />
      </section>

      {/* Format attendu */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
          Format attendu
        </h2>
        <pre
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.8rem 1rem",
            fontSize: "0.75rem",
            overflowX: "auto",
            color: "var(--muted)",
            lineHeight: 1.6,
          }}
        >{`[
  {
    "name": "Glace Café",
    "yield": "Pour 3/4 de litre",
    "ingredients": [
      { "name": "café en grains", "quantity": 40, "unit": "g" },
      { "name": "lait frais entier", "quantity": 500, "unit": "mL" },
      { "name": "jaunes d'œufs", "quantity": 5, "unit": "pièce" }
    ],
    "steps": "Torréfiez le café 10 min à 140°C...\\n\\nFaites bouillir le lait...",
    "notes": "Vous pouvez décorer avec des macarons café.",
    "source": "Livre Glaces"
  }
]`}</pre>
        <p className="fl-label" style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          Unités acceptées pour les ingrédients : <code>g</code> · <code>L</code> · <code>mL</code> · <code>pièce</code> · <code>QS</code>
        </p>
      </section>

      {/* Séparateur */}
      <div style={{ borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />

      <div>
        <h2 className="fl-title-serif" style={{ fontSize: "1.3rem" }}>
          Convertir un livre de recettes
        </h2>
        <p className="fl-label mt-1">
          Tu as scanné un livre ? Utilise l&apos;IA pour convertir le texte extrait en JSON importable.
          Voici tout ce dont tu as besoin.
        </p>
      </div>

      {/* Instructions de conversion */}
      <ConversionPromptSection />

    </div>
  );
}
