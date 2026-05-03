"use client";

import { useMemo } from "react";
import {
  buildCss,
  backgroundCss,
  renderCover,
  renderRecipeCard,
  type RecipeSnap,
} from "@/lib/pdf/template";
import { googleFontsHref, type CookbookTheme } from "@/lib/pdf/theme";

const SAMPLE_RECIPE: RecipeSnap = {
  name: "Tarte aux fraises",
  source: "Pierre Hermé · Patisserie",
  notesTips:
    "Cuire à blanc le fond pendant 15 min à 180 °C. Laisser refroidir avant de garnir.",
  rating: 4,
  tags: ["Été", "Fraîche", "Classique"],
  categories: ["Tartes"],
  ingredients: [
    { name: "Pâte sablée", quantityG: 250 },
    { name: "Fraises gariguette", quantityG: 500 },
    { name: "Crème pâtissière", quantityG: 300 },
    { name: "Sucre glace", quantityG: 30 },
  ],
  steps:
    "Étaler la pâte sablée et foncer un cercle de 22 cm.\nCuire à blanc 15 min à 180 °C.\nLaisser refroidir, garnir de crème pâtissière.\nDisposer les fraises coupées en deux sur la crème.\nSaupoudrer de sucre glace au moment de servir.",
  totalMassG: 1080,
  subRecipes: [
    {
      label: "Crème pâtissière",
      childName: "Crème pâtissière vanille",
      ingredients: [
        { name: "Lait entier", quantityG: 250 },
        { name: "Jaunes d'œufs", quantityG: 60 },
        { name: "Sucre", quantityG: 60 },
        { name: "Maïzena", quantityG: 25 },
        { name: "Gousse de vanille", quantityG: 5 },
      ],
      totalMassG: 400,
      steps:
        "Faire bouillir le lait avec la vanille fendue.\nBlanchir les jaunes avec le sucre, ajouter la maïzena.\nVerser le lait chaud sur le mélange, remettre sur le feu jusqu'à épaississement.\nFilmer au contact et réserver au frais.",
    },
  ],
};

export function CookbookPreview({
  cookbookName,
  description,
  theme,
  hasCover,
}: {
  cookbookName: string;
  description?: string;
  theme: CookbookTheme;
  hasCover: boolean;
}) {
  const html = useMemo(() => {
    const css = buildCss(theme)
      // Pour l'aperçu : on supprime les sauts de page forcés et on adapte la hauteur.
      .replace(/page-break-before: always;/g, "page-break-before: auto;")
      .replace(/page-break-after: always;/g, "page-break-after: auto;")
      .replace(/@page \{[^}]*\}/, "@page { margin: 0; }");

    const coverHtml = hasCover
      ? renderCover({
          cookbookName: cookbookName || "Mon cahier",
          description: description || "",
          theme,
        })
      : "";

    const recipeHtml = renderRecipeCard(SAMPLE_RECIPE, "single", 1, "", theme);
    const fontsLink = googleFontsHref(theme);
    const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";
    const recipeBg = backgroundCss(
      theme.bgPattern,
      theme.bgColor,
      theme.accentColor,
      theme.textColor,
      theme.bgImageUrl,
      theme.bgImageOpacity,
    );

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>
    html, body { background: #555; margin: 0; padding: 8px; }
    .preview-page {
      width: 100%;
      aspect-ratio: 1 / 1.414;
      box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      margin: 0 0 16px 0;
      padding: 12mm 14mm;
      overflow: hidden;
      position: relative;
    }
    .preview-page.cover-wrap {
      padding: 0;
    }
    .preview-page .cover {
      height: 100%;
      width: 100%;
    }
    ${css}
    body { background: #555; }
    .preview-page.bg-recipe {
      ${recipeBg}
      color: ${theme.textColor};
    }
    .recipe { min-height: auto; page-break-before: auto; }
  </style>
</head>
<body>
  ${coverHtml ? `<div class="preview-page cover-wrap">${coverHtml}</div>` : ""}
  <div class="preview-page bg-recipe">${recipeHtml}</div>
</body>
</html>`;
  }, [theme, cookbookName, description, hasCover]);

  return (
    <div
      className="rounded-md overflow-hidden border"
      style={{
        borderColor: "var(--border)",
        background: "#444",
      }}
    >
      <iframe
        title="Aperçu du cahier"
        srcDoc={html}
        sandbox=""
        style={{
          width: "100%",
          height: 480,
          border: 0,
          display: "block",
          background: "#888",
        }}
      />
    </div>
  );
}
