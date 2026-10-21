"use client";

import { useState } from "react";
import { Bot, Check, ChevronRight, Copy, ListChecks, Ruler } from "lucide-react";

const PROMPT = `Tu vas convertir le texte suivant (extrait d'un livre de recettes scanné) en fichier JSON importable dans RecipeLog.

Règles strictes :
- Le résultat est un tableau JSON valide contenant une entrée par recette
- Champs requis : name (string), yield (string ou null), ingredients (array), steps (string), notes (string), source (string)
- Unités acceptées UNIQUEMENT : "g", "L", "cc", "cs", "pièce", "QS"
- Conversions : kg en g × 1000, mL en g × 1, cl en g × 10, dl en g × 100, cuillère à soupe en "cs" (valeur inchangée), cuillère à café en "cc" (valeur inchangée)
- Ingrédients décoratifs / "pour le décor" / "QS" : unit "QS", quantity 0
- Étapes séparées par \\n\\n dans une seule chaîne, sans numérotation
- Fractions converties en décimal (1/2 devient 0.5)
- Source : "[NOM DU LIVRE]"
- Retourner UNIQUEMENT le JSON brut, sans explication ni markdown

Texte à convertir :
[TEXTE DES RECETTES]`;

const UNITS_ROWS = [
  ["g, gr, grammes", '"g"', "valeur inchangée"],
  ["kg, kilogrammes", '"g"', "× 1000"],
  ["L, litre", '"L"', "valeur inchangée"],
  ["ml, mL, millilitre", '"g"', "× 1 (1 mL ≈ 1 g)"],
  ["cl, cL, centilitre", '"g"', "× 10"],
  ["dl, dL, décilitre", '"g"', "× 100"],
  ["cuillère à soupe (cs)", '"cs"', "valeur inchangée"],
  ["cuillère à café (cc)", '"cc"', "valeur inchangée"],
  ["pièce, pcs, unité", '"pièce"', ""],
  ["œuf(s), citron(s)…", '"pièce"', ""],
  ["feuille(s) de gélatine…", '"pièce"', ""],
];

const EXAMPLE = `[
  {
    "name": "Glace au Café",
    "yield": "Pour 3/4 de litre",
    "ingredients": [
      { "name": "café en grains", "quantity": 40, "unit": "g" },
      { "name": "lait frais entier", "quantity": 500, "unit": "g" },
      { "name": "jaunes d'œufs", "quantity": 5, "unit": "pièce" },
      { "name": "sucre", "quantity": 150, "unit": "g" },
      { "name": "extrait de vanille", "quantity": 1, "unit": "cc" },
      { "name": "grains de café pour le décor", "quantity": 0, "unit": "QS" }
    ],
    "steps": "Torréfiez le café 10 min à 140°C.\\n\\nPortez le lait à ébullition avec le café.\\n\\nMélangez les jaunes avec le sucre, versez le lait chaud filtré.\\n\\nFaites épaissir à feu doux en remuant. Turbinez jusqu'à consistance crémeuse.",
    "notes": "Se conserve 2 semaines au congélateur.",
    "source": "Nom du livre"
  }
]`;

/** Aide à la conversion d'un livre scanné en JSON : prompt, unités, règles, exemple. */
export function ConversionPromptSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Prompt à copier */}
      <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 className="set-card-h" style={{ flex: 1 }}>
            <Bot size={17} />
            Prompt de conversion
          </h2>
          <button type="button" onClick={handleCopy} className={`fl-btn ${copied ? "fl-btn-secondary" : "fl-btn-primary"}`}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Copié" : "Copier"}
          </button>
        </div>
        <p className="set-note">
          Colle ce texte dans Claude (ou une autre IA) avec le texte extrait de ton scan. Remplace{" "}
          <code>[NOM DU LIVRE]</code> et <code>[TEXTE DES RECETTES]</code> avant d&apos;envoyer.
        </p>
        <pre className="set-code set-code-wrap" style={{ color: "var(--text)" }}>
          {PROMPT}
        </pre>
      </section>

      {/* Conversions d'unités */}
      <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="set-card-h">
          <Ruler size={17} />
          Conversions d&apos;unités
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table className="set-table">
            <thead>
              <tr>
                <th>Dans le livre</th>
                <th>Unité JSON</th>
                <th>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {UNITS_ROWS.map(([from, unit, conv], i) => (
                <tr key={i}>
                  <td style={{ color: "var(--text)" }}>{from}</td>
                  <td>
                    <code>{unit}</code>
                  </td>
                  <td>{conv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Règles spéciales */}
      <section className="fl-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 className="set-card-h">
          <ListChecks size={17} />
          Règles spéciales
        </h2>
        <ul className="set-rules">
          <li>
            <b>QS</b> : tout ingrédient « pour le décor », « à volonté », « selon goût » ou sans
            quantité devient <code>unit: &quot;QS&quot;</code>, <code>quantity: 0</code>.
          </li>
          <li>
            <b>Fractions</b> : en décimal, <code>1/2</code> donne <code>0.5</code>, <code>3/4</code> donne{" "}
            <code>0.75</code>, <code>1 1/2</code> donne <code>1.5</code>.
          </li>
          <li>
            <b>Étapes</b> : une seule chaîne de texte, paragraphes séparés par <code>\n\n</code>, sans
            numérotation.
          </li>
          <li>
            <b>Rendement</b> : « Pour 4 personnes », « Pour 3/4 de litre »… va dans le champ{" "}
            <code>yield</code>, en texte libre.
          </li>
          <li>
            <b>Conseils, variantes</b> : tout ce qui n&apos;est pas une étape de préparation va dans le
            champ <code>notes</code>.
          </li>
        </ul>
        <details className="set-details">
          <summary>
            <ChevronRight size={14} /> Voir un exemple de résultat attendu
          </summary>
          <pre className="set-code" style={{ marginTop: 10 }}>
            {EXAMPLE}
          </pre>
        </details>
      </section>
    </div>
  );
}
