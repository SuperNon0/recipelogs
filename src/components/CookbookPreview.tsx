"use client";

import { useMemo, useState } from "react";
import {
  buildCss,
  backgroundCss,
  renderCover,
  renderRecipeCard,
  type RecipeSnap,
} from "@/lib/pdf/template";
import { FONTS, googleFontsHref, type CookbookTheme } from "@/lib/pdf/theme";

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
      label: "Crème pâtissière vanille",
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
    {
      label: "Pâte sablée",
      childName: "Pâte sablée amande",
      ingredients: [
        { name: "Beurre doux", quantityG: 150 },
        { name: "Sucre glace", quantityG: 90 },
        { name: "Poudre d'amande", quantityG: 30 },
        { name: "Œuf", quantityG: 50 },
        { name: "Farine T55", quantityG: 250 },
      ],
      totalMassG: 570,
      steps:
        "Crémer le beurre pommade avec le sucre glace.\nAjouter l'œuf et la poudre d'amande.\nIncorporer la farine sans trop travailler.\nFraser, filmer et réserver 1h au frais.",
    },
  ],
};

const ZOOM_PRESETS = [
  { key: "S", label: "Petit", height: 420 },
  { key: "M", label: "Moyen", height: 680 },
  { key: "L", label: "Grand", height: 940 },
  { key: "XL", label: "Plein écran", height: 0 /* fullscreen */ },
] as const;

type ZoomKey = (typeof ZOOM_PRESETS)[number]["key"];

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
  const [zoom, setZoom] = useState<ZoomKey>("M");
  const [fullscreen, setFullscreen] = useState(false);

  const html = useMemo(() => {
    const css = buildCss(theme)
      // Pour l'aperçu : pas de saut de page forcé, marges remises à zéro
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

    // On force la police sur la page de recette et sur la couverture
    // (au cas où buildCss serait shadowé par autre chose)
    const bodyFontFamily = (FONTS[theme.bodyFont] ?? FONTS.arial).family;
    const titleFontFamily = (FONTS[theme.titleFont] ?? FONTS.arial).family;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>
    html, body { margin: 0; padding: 0; background: #2a2a2a; }
    .scroll-area {
      padding: 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .preview-page {
      width: min(640px, 100%);
      aspect-ratio: 1 / 1.414;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      padding: 12mm 14mm;
      overflow: hidden;
      position: relative;
      font-family: ${bodyFontFamily};
    }
    .preview-page.cover-wrap { padding: 0; }
    .preview-page .cover { height: 100%; width: 100%; }
    .preview-page .cover-title,
    .preview-page .recipe-title,
    .preview-page .col-title,
    .preview-page .toc-section-title,
    .preview-page .toc-group-title,
    .preview-page .subrecipe-title,
    .preview-page .notes-title {
      font-family: ${titleFontFamily} !important;
    }
    .preview-page,
    .preview-page * {
      /* Le rendu interne se base sur la police du theme */
    }
    ${css}
    .preview-page.bg-recipe {
      ${recipeBg}
      color: ${theme.textColor};
    }
    .recipe { min-height: auto; page-break-before: auto; }
  </style>
</head>
<body>
  <div class="scroll-area">
    ${coverHtml ? `<div class="preview-page cover-wrap">${coverHtml}</div>` : ""}
    <div class="preview-page bg-recipe">${recipeHtml}</div>
  </div>
</body>
</html>`;
  }, [theme, cookbookName, description, hasCover]);

  const currentZoom = ZOOM_PRESETS.find((z) => z.key === zoom) ?? ZOOM_PRESETS[1];

  if (fullscreen) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(14, 15, 17, 0.96)",
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          padding: 12,
          gap: 8,
        }}
      >
        <div className="flex items-center justify-between">
          <span className="fl-label" style={{ color: "var(--text)" }}>
            Aperçu plein écran
          </span>
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            className="fl-btn fl-btn-secondary"
            style={{ fontSize: "0.8rem" }}
          >
            ✕ Fermer
          </button>
        </div>
        <iframe
          title="Aperçu du cahier (plein écran)"
          srcDoc={html}
          // allow-same-origin pour que les Google Fonts puissent charger
          sandbox="allow-same-origin"
          style={{
            flex: 1,
            width: "100%",
            border: 0,
            display: "block",
            background: "#2a2a2a",
            borderRadius: 8,
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap">
        <span
          className="fl-label"
          style={{ fontSize: "0.7rem", marginRight: 4 }}
        >
          Taille :
        </span>
        {ZOOM_PRESETS.map((p) => {
          const selected = p.key === zoom;
          if (p.key === "XL") {
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setFullscreen(true)}
                className="fl-btn"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.55rem" }}
                title="Plein écran"
              >
                ⛶ {p.label}
              </button>
            );
          }
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setZoom(p.key)}
              style={{
                padding: "0.3rem 0.55rem",
                fontSize: "0.75rem",
                fontWeight: selected ? 700 : 500,
                background: selected ? "var(--accent)" : "transparent",
                color: selected ? "var(--bg)" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Iframe */}
      <div
        className="rounded-md overflow-hidden border"
        style={{
          borderColor: "var(--border)",
          background: "#2a2a2a",
        }}
      >
        <iframe
          title="Aperçu du cahier"
          srcDoc={html}
          // allow-same-origin pour que les Google Fonts puissent charger
          // (sandbox="" donne une origine "null" → fetch CSS bloqué)
          sandbox="allow-same-origin"
          style={{
            width: "100%",
            height: currentZoom.height,
            border: 0,
            display: "block",
            background: "#2a2a2a",
          }}
        />
      </div>
    </div>
  );
}
