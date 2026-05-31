"use client";

import { useState } from "react";

const PROMPT = `Tu vas convertir le texte suivant (extrait d'un livre de recettes scanné) en fichier JSON importable dans RecipeLog.

Règles strictes :
- Le résultat est un tableau JSON valide contenant une entrée par recette
- Champs requis : name (string), yield (string ou null), ingredients (array), steps (string), notes (string), source (string)
- Unités acceptées UNIQUEMENT : "g", "L", "cc", "cs", "pièce", "QS"
- Conversions : kg→g×1000, mL→g×1, cl→g×10, dl→g×100, cuillère à soupe→"cs" (valeur inchangée), cuillère à café→"cc" (valeur inchangée)
- Ingrédients décoratifs / "pour le décor" / "QS" → unit:"QS", quantity:0
- Étapes séparées par \\n\\n dans une seule chaîne, sans numérotation
- Fractions converties en décimal (1/2→0.5)
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
  ["pièce, pcs, unité", '"pièce"', "—"],
  ["œuf(s), citron(s)…", '"pièce"', "—"],
  ["feuille(s) de gélatine…", '"pièce"', "—"],
];

export function ConversionPromptSection() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Prompt à copier */}
      <section className="fl-card flex flex-col gap-4">
        <div>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            🤖 Prompt de conversion pour l&apos;IA
          </h2>
          <p className="fl-label mt-1">
            Copie ce prompt et colle-le dans Claude (ou tout autre IA) avec le texte extrait de ton scan.
            Remplace <code>[NOM DU LIVRE]</code> et <code>[TEXTE DES RECETTES]</code> avant d&apos;envoyer.
          </p>
        </div>

        <div style={{ position: "relative" }}>
          <pre
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "1rem",
              fontSize: "0.78rem",
              lineHeight: 1.65,
              color: "var(--text)",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {PROMPT}
          </pre>
          <button
            type="button"
            onClick={handleCopy}
            className="fl-btn fl-btn-primary"
            style={{
              position: "absolute",
              top: "0.6rem",
              right: "0.6rem",
              fontSize: "0.78rem",
              padding: "0.3rem 0.75rem",
            }}
          >
            {copied ? "✓ Copié !" : "Copier"}
          </button>
        </div>
      </section>

      {/* Conversions d'unités */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
          📐 Conversions d&apos;unités
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem 0.4rem 0", color: "var(--muted)", fontWeight: 500 }}>Dans le livre</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.75rem", color: "var(--muted)", fontWeight: 500 }}>Unité JSON</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0 0.4rem 0.75rem", color: "var(--muted)", fontWeight: 500 }}>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {UNITS_ROWS.map(([from, unit, conv], i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "0.35rem 0.75rem 0.35rem 0", color: "var(--text)" }}>{from}</td>
                  <td style={{ padding: "0.35rem 0.75rem" }}>
                    <code style={{ color: "var(--accent)", fontSize: "0.8rem" }}>{unit}</code>
                  </td>
                  <td style={{ padding: "0.35rem 0 0.35rem 0.75rem", color: "var(--muted)" }}>{conv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Règles spéciales */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
          📋 Règles spéciales
        </h2>
        <ul className="flex flex-col gap-2" style={{ fontSize: "0.85rem" }}>
          <li style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>QS</span>
            <span style={{ color: "var(--muted)" }}> — </span>
            Tout ingrédient &quot;pour le décor&quot;, &quot;à volonté&quot;, &quot;selon goût&quot; ou sans quantité → <code>unit:&quot;QS&quot;</code>, <code>quantity:0</code>
          </li>
          <li style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Fractions</span>
            <span style={{ color: "var(--muted)" }}> — </span>
            Convertir en décimal : <code>1/2 → 0.5</code> · <code>3/4 → 0.75</code> · <code>1 1/2 → 1.5</code>
          </li>
          <li style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Étapes</span>
            <span style={{ color: "var(--muted)" }}> — </span>
            Une seule chaîne de texte, paragraphes séparés par <code>\n\n</code>, sans numérotation
          </li>
          <li style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Rendement</span>
            <span style={{ color: "var(--muted)" }}> — </span>
            &quot;Pour 4 personnes&quot;, &quot;Pour 3/4 de litre&quot;… → champ <code>yield</code> en texte libre
          </li>
          <li style={{ color: "var(--text)" }}>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>Conseils / variantes</span>
            <span style={{ color: "var(--muted)" }}> — </span>
            Tout ce qui n&apos;est pas une étape de préparation → champ <code>notes</code>
          </li>
        </ul>
      </section>

      {/* Exemple */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
          💡 Exemple de résultat attendu
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
]`}</pre>
      </section>

    </div>
  );
}
