import Link from "next/link";
import { Braces, ChevronLeft, FileJson } from "lucide-react";
import { JsonRecipeImport } from "@/components/JsonRecipeImport";
import { ConversionPromptSection } from "@/components/ConversionPromptSection";
import { Help } from "@/components/ui/Help";

export const dynamic = "force-dynamic";

const EXAMPLE = `[
  {
    "name": "Glace Café",
    "yield": "Pour 3/4 de litre",
    "ingredients": [
      { "name": "café en grains", "quantity": 40, "unit": "g" },
      { "name": "lait frais entier", "quantity": 500, "unit": "g" },
      { "name": "jaunes d'œufs", "quantity": 5, "unit": "pièce" },
      { "name": "extrait de vanille", "quantity": 1, "unit": "cc" }
    ],
    "steps": "Torréfiez le café 10 min à 140°C...\\n\\nFaites bouillir le lait...",
    "notes": "Vous pouvez décorer avec des macarons café.",
    "source": "Livre Glaces"
  }
]`;

export default function ImportJsonPage() {
  return (
    <div className="set-page">
      <Link href="/settings" className="crumb">
        <ChevronLeft size={14} /> Réglages
      </Link>
      <div className="page-head">
        <h1>Import JSON</h1>
        <p className="sub">
          Charge un fichier JSON exporté depuis RecipeLog ou converti depuis un autre format. Les
          recettes déjà présentes (même nom) sont ignorées.
        </p>
      </div>

      <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 className="set-card-h">
          <FileJson size={17} />
          Importer un fichier
        </h2>
        <JsonRecipeImport />
      </section>

      <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <h2 className="set-card-h">
          <Braces size={17} />
          Format attendu
          <Help title="Format JSON d'import">
            Le fichier contient une liste de recettes entre crochets <code>[ … ]</code>. Pour chaque
            recette : <b>name</b> (nom, obligatoire), <b>yield</b> (rendement, texte libre),{" "}
            <b>ingredients</b> (liste avec <b>name</b>, <b>quantity</b> et <b>unit</b>), <b>steps</b>{" "}
            (étapes dans un seul texte, séparées par une ligne vide), <b>notes</b> et <b>source</b>.
            <br />
            <br />
            Unités reconnues : g, L, cc, cs, pièce et QS. Les mL, cl et kg sont convertis en
            grammes à l&apos;import.
          </Help>
        </h2>
        <pre className="set-code">{EXAMPLE}</pre>
        <p className="set-note">
          Unités : <code>g</code>, <code>L</code>, <code>cc</code>, <code>cs</code>, <code>pièce</code>,{" "}
          <code>QS</code>. Converties automatiquement : mL en g, cl en g × 10, kg en g × 1000.
        </p>
      </section>

      <div className="sect-title" style={{ marginTop: 32 }}>
        <h2>Convertir un livre de recettes</h2>
      </div>
      <p style={{ color: "var(--soft)", marginBottom: 12 }}>
        Tu as scanné un livre ? Demande à une IA de convertir le texte extrait en JSON importable.
        Voici tout ce dont tu as besoin.
      </p>
      <ConversionPromptSection />
    </div>
  );
}
