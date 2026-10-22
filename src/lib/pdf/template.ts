import {
  type CookbookTheme,
  type CoverBgPattern,
  DEFAULT_THEME,
  FONTS,
  titleSizeFor,
  googleFontsHref,
  coverPatternCss,
  INGREDIENT_RATIO_WIDTH,
  TITLE_SCALE_FACTOR,
  recipePageMargins,
} from "./theme";
import { sanitizeRichText, looksLikeHtml } from "../sanitizeRichText";
import { recipeMass } from "../massAdjust";
import { formatG, formatQty } from "../format";

/** Slug historique conservé pour compatibilité descendante. */
export type TemplateSlug = "classique" | "moderne" | "fiche-technique" | "magazine";
type SubrecipeMode = "single" | "separate";

/** Une entrée de cahier dans le PDF : soit une recette, soit une page chapitre. */
export type CookbookEntryUnion =
  | {
      type: "recipe";
      snap: RecipeSnap;
      subrecipeMode: SubrecipeMode;
      separateSnaps?: RecipeSnap[];
      portion?: string;
      sectionTitle?: string | null;
    }
  | {
      type: "chapter";
      title: string;
      intro: string;
    };

export type RecipeSnap = {
  recipeId?: number;
  name: string;
  source?: string | null;
  notesTips?: string | null;
  rating?: number | null;
  photoPath?: string | null;
  tags?: string[];
  categories?: string[];
  ingredients: { name: string; quantityG: number; quantityGMax?: number | null; unit?: string }[];
  steps: string | null;
  totalMassG: number;
  totalMassGMin?: number;
  totalMassGMax?: number;
  subRecipes: {
    label: string | null;
    childName: string;
    ingredients: { name: string; quantityG: number; quantityGMax?: number | null; unit?: string }[];
    totalMassG: number;
    totalMassGMin?: number;
    totalMassGMax?: number;
    steps: string | null;
  }[];
  multiplier?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mute(hex: string, amount = 0.5): string {
  const c = hexToRgb(hex);
  if (!c) return "#888";
  const r = Math.round(c.r + (136 - c.r) * amount);
  const g = Math.round(c.g + (136 - c.g) * amount);
  const b = Math.round(c.b + (136 - c.b) * amount);
  return `rgb(${r},${g},${b})`;
}

function shade(hex: string, amount: number): string {
  const c = hexToRgb(hex);
  if (!c) return hex;
  const r = Math.round(c.r + (51 - c.r) * amount);
  const g = Math.round(c.g + (51 - c.g) * amount);
  const b = Math.round(c.b + (51 - c.b) * amount);
  return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return `rgba(255,255,255,${alpha})`;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
}

// ─── Fond de page de couverture (séparé des layouts) ─────────────────────────

export function coverBackgroundCss(theme: CookbookTheme): string {
  const c1 = theme.coverBgColor;
  const c2 = theme.coverBgColor2;
  switch (theme.coverBgPattern as CoverBgPattern) {
    case "plain":
      return `background: ${c1};`;
    case "gradient-diagonal":
      return `background: linear-gradient(135deg, ${c1} 0%, ${c2} 100%);`;
    case "gradient-vertical":
      return `background: linear-gradient(180deg, ${c1} 0%, ${c2} 100%);`;
    case "gradient-radial":
      return `background: radial-gradient(circle at center, ${c1} 0%, ${c2} 100%);`;
    case "accent-corner": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><polygon points='0,0 200,0 0,200' fill='${encodeURIComponent(theme.coverAccentColor)}' fill-opacity='0.55'/></svg>`;
      return `background: ${c1} url("data:image/svg+xml;utf8,${svg}") no-repeat top left; background-size: 60mm 60mm;`;
    }
    case "dots":
    case "stripes":
    case "grid":
      return `background: ${coverPatternCss(theme.coverBgPattern as "dots" | "stripes" | "grid", c1, c2, (mm) => `${mm}mm`)};`;
    case "image": {
      if (!theme.coverBgImageUrl) return `background: ${c1};`;
      const a = Math.max(0, Math.min(1, 1 - theme.coverBgImageOpacity));
      const overlay = hexToRgba(c1, a);
      return `background: linear-gradient(${overlay}, ${overlay}), url("${theme.coverBgImageUrl.replace(/"/g, "%22")}") center / cover no-repeat, ${c1};`;
    }
    default:
      return `background: ${c1};`;
  }
}

// ─── CSS principal ────────────────────────────────────────────────────────────

export function buildCss(
  theme: CookbookTheme,
  pageOptions: {
    format?: "A4" | "A5";
    /** Si true, la première page (= la couverture) est sans marges (full bleed). */
    bleedFirstPage?: boolean;
    /** Marges (en mm) appliquées via @page sur les pages NON couverture. */
    margins?: { top: number; right: number; bottom: number; left: number };
  } = {},
): string {
  const titleFont = (FONTS[theme.titleFont] ?? FONTS.arial).family;
  const bodyFont = (FONTS[theme.bodyFont] ?? FONTS.arial).family;
  const baseSize = theme.textSize;
  const titleSize = Math.round(titleSizeFor(theme.textSize) * (TITLE_SCALE_FACTOR[theme.titleScale] ?? 1) * 2) / 2;

  // Placement des colonnes : voir aussi placementCss (gauche / droite / dessus).
  const ingFlex = `0 0 ${INGREDIENT_RATIO_WIDTH[theme.ingredientsRatio] ?? "38%"}`;
  const colsDirection = "row";
  const stackedColumns = false;
  const coverBg = coverBackgroundCss(theme);

  const format = pageOptions.format ?? "A4";
  const m = pageOptions.margins ?? { top: 10, right: 12, bottom: 16, left: 12 };
  const pageRules = `
    @page {
      size: ${format};
      margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm;
    }
    ${pageOptions.bleedFirstPage ? `@page :first { margin: 0; }` : ""}
  `;

  return `
    ${pageRules}
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${bodyFont};
      font-size: ${baseSize}pt;
      color: ${theme.textColor};
      /* Transparent : le papier (crème, ligné…) est dessiné sous la page par decorate.ts */
      background: transparent;
      line-height: 1.5;
    }

    /* ─── Couverture ─── */
    .cover {
      position: relative;
      width: 100%;
      height: 100vh;
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      ${coverBg}
      color: ${theme.coverTextColor};
    }
    .cover-title {
      font-family: ${titleFont};
      font-size: ${titleSize + 8}pt;
      font-weight: 700;
      line-height: 1.05;
      text-align: center;
      color: inherit;
    }
    .cover-subtitle {
      font-family: ${bodyFont};
      font-size: ${baseSize + 2}pt;
      margin-top: 6mm;
      opacity: 0.85;
      text-align: center;
      color: inherit;
    }

    /* Layouts cover : uniquement le placement du texte */
    .cover-circle .cover-inner {
      width: 78mm; height: 78mm;
      background: #ffffff;
      color: ${theme.coverTextColor};
      border-radius: 50%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 8mm;
    }
    .cover-circle .cover-title { color: ${theme.coverTextColor}; }
    .cover-circle .cover-subtitle { color: ${mute(theme.coverTextColor, 0.4)}; }

    .cover-framed .cover-inner {
      border: 2px solid currentColor;
      padding: 14mm 18mm;
      text-align: center;
    }

    .cover-full-bleed .cover-inner {
      text-align: center; padding: 20mm;
    }
    .cover-full-bleed .cover-title { font-size: ${titleSize + 14}pt; }

    .cover-minimal .cover-inner {
      text-align: center;
      border-top: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      padding: 8mm 14mm;
    }

    .cover-typo-large .cover-inner { text-align: center; padding: 0 16mm; }
    .cover-typo-large .cover-title {
      font-size: ${titleSize + 24}pt;
      letter-spacing: -0.02em;
    }

    .cover-typo-divider .cover-inner { text-align: center; padding: 0 18mm; }
    .cover-typo-divider .cover-inner::before,
    .cover-typo-divider .cover-inner::after {
      content: "";
      display: block;
      width: 30mm;
      height: 1px;
      background: currentColor;
      margin: 8mm auto;
    }
    .cover-typo-divider .cover-title {
      font-size: ${titleSize + 10}pt;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* ─── Sommaire ─── */
    .toc { page-break-after: always; padding-top: 6mm; }
    .toc-section-title {
      font-family: ${titleFont};
      font-size: ${titleSize}pt; font-weight: 700; color: ${theme.accentColor};
      text-align: center; margin-bottom: 12mm;
    }
    .toc-group-title {
      font-family: ${titleFont};
      font-size: ${baseSize + 4}pt; font-weight: 700; color: ${theme.accentColor};
      margin: 6mm 0 2mm 0;
      display: flex; justify-content: space-between;
    }
    .toc-entry {
      display: flex; align-items: baseline;
      font-size: ${baseSize + 0.5}pt; padding: 1.2mm 0;
      color: ${theme.textColor};
      gap: 4px;
    }
    .toc-entry .toc-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; }
    .toc-entry .toc-leader {
      flex: 1 1 auto;
      border-bottom: 1px dotted ${mute(theme.textColor)};
      transform: translateY(-3px);
      margin: 0 4px;
      min-width: 8mm;
    }
    .toc-entry .toc-leader-empty { flex: 1 1 auto; }
    .toc-entry .toc-num { color: ${theme.textColor}; flex: 0 0 auto; }
    /* Sous-recettes dans le sommaire : indentées sous leur parente, plus discrètes */
    .toc-entry-sub {
      padding-left: 8mm;
      font-size: ${baseSize - 0.5}pt;
      color: ${mute(theme.textColor, 0.25)};
    }
    .toc-entry-sub .toc-num {
      color: ${mute(theme.textColor, 0.25)};
    }

    /* ─── Page chapitre ─── */
    .chapter-page {
      page-break-before: always;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 95vh;
      padding: 0 20mm;
      text-align: center;
    }
    .chapter-title {
      font-family: ${titleFont};
      font-size: ${titleSize + 14}pt;
      font-weight: 700;
      color: ${theme.accentColor};
      letter-spacing: 0.02em;
      line-height: 1.1;
    }
    .chapter-intro {
      font-family: ${bodyFont};
      font-size: ${baseSize + 1.5}pt;
      color: ${mute(theme.textColor, 0.2)};
      max-width: 120mm;
      margin-top: 8mm;
      line-height: 1.6;
      white-space: pre-wrap;
    }
    .chapter-rule {
      width: 30mm;
      height: 1.5px;
      background: ${theme.accentColor};
      margin: 6mm 0;
    }

    /* ─── Titre de section au-dessus d'une recette ─── */
    .section-title {
      page-break-before: always;
      font-family: ${titleFont};
      font-size: ${titleSize - 2}pt;
      font-weight: 700;
      color: ${theme.accentColor};
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
      padding: 4mm 0 2mm;
      border-bottom: 1px solid ${theme.accentColor};
      margin-bottom: 4mm;
    }
    .section-title + .recipe {
      page-break-before: auto;
    }

    /* ─── Recette ─── */
    .recipe {
      page-break-before: always;
      position: relative;
      min-height: 95vh;
    }
    .recipe-title {
      font-family: ${titleFont};
      font-size: ${titleSize}pt; font-weight: 700; color: ${theme.accentColor};
      text-align: center; margin: 4mm 0 3mm;
      line-height: 1.15;
    }
    .recipe-categories {
      font-size: ${baseSize - 0.5}pt; color: ${mute(theme.textColor)};
      text-align: center; margin-bottom: 1.5mm;
      font-style: italic;
    }
    /* Mention « Sous-recette de · [parent] » sous le titre des fiches sous-recette */
    .subrecipe-of {
      text-align: center;
      font-size: ${baseSize - 0.5}pt;
      color: ${theme.accentColor};
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 2mm;
    }
    .recipe-rating {
      text-align: center; margin-bottom: 2mm;
      color: ${theme.accentColor}; letter-spacing: 2px;
      font-size: ${baseSize + 1}pt;
    }
    .portion {
      font-size: ${baseSize}pt; color: ${theme.accentColor}; font-weight: 700;
      text-align: center; margin-bottom: 6mm;
    }
    .portion-value { color: ${theme.textColor}; font-weight: 400; }
    .columns {
      display: flex; gap: 6mm; margin-top: 3mm;
      flex-direction: ${stackedColumns ? "column" : colsDirection};
    }
    .col { flex: 1; min-width: 0; }
    .col-ing { flex: ${stackedColumns ? "0 0 auto" : ingFlex}; }
    .col-prep { flex: 1; }
    .col-title {
      font-family: ${titleFont};
      font-size: ${baseSize + 3}pt; font-weight: 700; color: ${theme.accentColor};
      margin-bottom: 3mm;
    }
    .ing-item {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin-bottom: 1.8mm;
      line-height: 1.4;
    }
    .ing-item .ing-qty {
      flex: 0 0 auto;
      font-weight: 600;
      color: ${theme.accentColor};
      font-variant-numeric: tabular-nums;
      min-width: 18mm;
      white-space: nowrap;
    }
    .ing-unit-muted { font-weight: 400; color: ${mute(theme.textColor)}; font-size: 0.9em; }
    .ing-item .ing-name {
      flex: 1 1 auto;
      color: ${theme.textColor};
    }
    .total-line {
      margin-top: 4mm;
      padding-top: 1.5mm;
      border-top: 1px solid ${theme.accentColor};
      font-weight: 700; color: ${theme.accentColor};
    }
    .step { margin-bottom: 3mm; line-height: 1.5; }
    .step-num { font-weight: 700; }
    .steps-rich {
      line-height: 1.55;
      counter-reset: step;
    }
    /* Numérotation auto des étapes (1. 2. 3. …) sur chaque paragraphe
       de premier niveau, qu'il vienne de l'éditeur Tiptap ou d'un import. */
    .steps-rich > p {
      counter-increment: step;
      position: relative;
      padding-left: 8mm;
      margin: 0 0 2.5mm;
    }
    .steps-rich > p::before {
      content: counter(step) ".";
      position: absolute;
      left: 0;
      top: 0;
      font-weight: 700;
      color: ${theme.accentColor};
      font-variant-numeric: tabular-nums;
      min-width: 6mm;
    }
    .steps-rich p { margin: 0 0 2mm; }
    .steps-rich h3 {
      font-family: ${titleFont};
      font-size: ${baseSize + 1.5}pt;
      font-weight: 700;
      color: ${theme.accentColor};
      margin: 3mm 0 1.5mm;
    }
    .steps-rich h4 {
      font-family: ${titleFont};
      font-size: ${baseSize + 0.5}pt;
      font-weight: 700;
      margin: 2mm 0 1mm;
    }
    .steps-rich ul, .steps-rich ol { padding-left: 5mm; margin: 1mm 0 2mm; }
    .steps-rich li { margin-bottom: 0.8mm; }
    .steps-rich strong, .steps-rich b { font-weight: 700; }
    .steps-rich em, .steps-rich i { font-style: italic; }
    .steps-rich u { text-decoration: underline; }
    .steps-rich s, .steps-rich del { text-decoration: line-through; }
    .steps-rich mark { padding: 0 1mm; border-radius: 1mm; }
    .steps-rich code {
      font-family: "Courier New", monospace;
      background: ${mute(theme.textColor, 0.92)};
      padding: 0 1mm; border-radius: 1mm;
      font-size: ${baseSize - 0.5}pt;
    }
    .steps-rich blockquote {
      margin: 2mm 0; padding-left: 3mm;
      border-left: 2px solid ${theme.accentColor};
      color: ${mute(theme.textColor, 0.3)};
      font-style: italic;
    }
    .source {
      font-size: ${baseSize - 1.5}pt; color: ${mute(theme.textColor)};
      font-style: italic; text-align: center;
      margin-top: 2mm;
    }
    .notes {
      font-size: ${baseSize - 1}pt; color: ${shade(theme.textColor, 0.3)};
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 1px dashed ${mute(theme.textColor, 0.4)};
      white-space: pre-wrap;
    }
    .notes-title {
      font-family: ${titleFont};
      font-weight: 700; color: ${theme.accentColor}; margin-bottom: 1mm;
    }
    .tags-line {
      text-align: center; margin-bottom: 2mm;
      font-size: ${baseSize - 0.5}pt;
    }
    .tag-chip {
      display: inline-block;
      padding: 0.5mm 2mm;
      border: 1px solid ${theme.accentColor};
      border-radius: 999px;
      color: ${theme.accentColor};
      margin: 0 1mm;
    }
    .subrecipe-block {
      margin-top: 6mm;
      padding-top: 3mm;
      border-top: 2px solid ${hexToRgba(theme.accentColor, 0.2)};
    }
    .subrecipe-title {
      font-family: ${titleFont};
      font-size: ${baseSize + 3}pt; font-weight: 700; color: ${theme.accentColor};
      margin-bottom: 2mm;
    }
    .muted { color: ${mute(theme.textColor)}; font-style: italic; }
    .ing-qs { color: ${theme.accentColor}; font-weight: 600; }
    ${decorationCss(theme, { baseSize })}
    ${layoutCss(theme, { titleFont, baseSize, titleSize })}
    ${placementCss(theme, { baseSize })}
  `;
}

/** Classes de <body> qui activent la mise en page et les styles choisis. */
function bodyClass(theme: CookbookTheme): string {
  return `layout-${theme.recipeLayout} title-${theme.titleStyle} steps-${theme.stepStyle} ing-${theme.ingredientStyle} qty-${theme.qtyPosition}`;
}

/**
 * Disposition choisie dans le thème (place des ingrédients, alignement et casse
 * du titre, intertitres, espacement). Placé APRÈS layoutCss pour primer sur la
 * mise en page : les sélecteurs commencent par `.recipe` pour avoir le même
 * poids que ceux de layoutCss (`.layout-moderne .columns`…), sinon le réglage
 * était ignoré en Moderne, Magazine et Fiche technique.
 */
function placementCss(theme: CookbookTheme, v: { baseSize: number }): string {
  const a = theme.accentColor;
  const out: string[] = [];
  const sideBySide = theme.recipeLayout === "classique" || theme.recipeLayout === "magazine";

  // Ingrédients à droite / au-dessus
  if (sideBySide) {
    if (theme.ingredientsPosition === "right") out.push(`.recipe .columns { flex-direction: row-reverse; }`);
    if (theme.ingredientsPosition === "top") {
      out.push(`.recipe .columns { flex-direction: column; gap: 5mm; } .recipe .col-ing { flex: 0 0 auto; }`);
    }
  } else if (theme.ingredientsPosition === "right") {
    // Mises en page en une colonne : « à droite » = la préparation d'abord.
    out.push(`.recipe .columns { flex-direction: column-reverse; }`);
  }

  // Alignement du titre et des lignes qui le suivent
  if (theme.titleAlign !== "auto") {
    const al = theme.titleAlign;
    out.push(`
      .recipe .recipe-title, .recipe .recipe-categories, .recipe .tags-line, .recipe .subrecipe-of, .recipe .portion, .recipe .recipe-rating, .recipe .source { text-align: ${al}; }
      .recipe .recipe-title::after { margin-left: ${al === "left" ? "0" : "auto"} !important; margin-right: ${al === "right" ? "0" : "auto"} !important; }
      .recipe .tag-chip { margin: 0 ${al === "right" ? "0 0 2mm" : al === "left" ? "2mm 0 0" : "1mm"}; }
    `);
  }
  if (theme.titleUppercase) {
    out.push(`.recipe .recipe-title { text-transform: uppercase; letter-spacing: 0.04em; }`);
  }

  // Intertitres « Ingrédients » / « Préparation »
  switch (theme.sectionTitleStyle) {
    case "underline":
      out.push(`.recipe .col-title { border-bottom: 1.5px solid ${a}; padding-bottom: 1.2mm; }`);
      break;
    case "caps":
      out.push(`.recipe .col-title { text-transform: uppercase; letter-spacing: 0.14em; font-size: ${v.baseSize}pt; }`);
      break;
    case "pill":
      out.push(`.recipe .col-title { display: inline-block; background: ${a}; color: #ffffff; padding: 0.8mm 3.2mm; border-radius: 999px; font-size: ${v.baseSize + 0.5}pt; border-bottom: none; }`);
      break;
  }

  // Espacement
  if (theme.density === "compact") {
    out.push(`
      body { line-height: 1.35; }
      .recipe .columns { gap: 4mm; }
      .recipe .ing-item { margin-bottom: 0.9mm; }
      .recipe .steps-rich > p { margin-bottom: 1.4mm; }
      .recipe .recipe-title { margin-top: 2mm; margin-bottom: 2mm; }
      .recipe .notes { margin-top: 4mm; }
    `);
  } else if (theme.density === "airy") {
    out.push(`
      body { line-height: 1.68; }
      .recipe .columns { gap: 9mm; }
      .recipe .ing-item { margin-bottom: 2.8mm; }
      .recipe .steps-rich > p { margin-bottom: 4mm; }
      .recipe .recipe-title { margin-top: 6mm; margin-bottom: 5mm; }
      .recipe .notes { margin-top: 9mm; }
    `);
  }
  // Liste d'ingrédients : quantité après le nom, lignes zébrées, colonnes
  if (theme.qtyPosition === "after") {
    out.push(`.qty-after .ing-item .ing-name { order: 1; } .qty-after .ing-item .ing-qty { order: 2; min-width: 0; margin-left: auto; text-align: right; }`);
  }
  if (theme.ingZebra) {
    out.push(`.recipe .ing-item:nth-child(even) { background: ${hexToRgba(a, 0.08)}; } .recipe .ing-item { padding: 0.5mm 1.5mm; border-radius: 1mm; }`);
  }
  if (theme.ingColumns === "one") out.push(`.recipe .ing-list { column-count: 1; }`);
  if (theme.ingColumns === "two") {
    out.push(`.recipe .ing-list { column-count: 2; column-gap: 8mm; } .recipe .ing-item { break-inside: avoid; }`);
  }

  // Préparation : colonnes et filets entre les étapes
  if (theme.stepsColumns === "two") {
    out.push(`.recipe .steps-rich { column-count: 2; column-gap: 8mm; } .recipe .steps-rich > p { break-inside: avoid; }`);
  }
  if (theme.stepDivider) {
    out.push(`.recipe .steps-rich > p:not(:last-child) { border-bottom: 0.6px solid ${hexToRgba(theme.textColor, 0.18)}; padding-bottom: 2mm; margin-bottom: 2mm; }`);
  }
  return out.join("\n");
}

/**
 * Styles de titre, d'étapes et d'ingrédients (classes `title-*`, `steps-*`,
 * `ing-*` sur <body>). Placés AVANT layoutCss : une mise en page peut les
 * surcharger (ex. le magazine n'affiche pas de numéros d'étapes).
 */
function decorationCss(theme: CookbookTheme, v: { baseSize: number }): string {
  const a = theme.accentColor;
  const muted = mute(theme.textColor);
  return `
    /* ─── Titres ─── */
    .title-underline .recipe-title::after {
      content: ""; display: block; width: 24mm; height: 2px; background: ${a}; margin: 2.5mm auto 0;
    }
    .title-ornament .recipe-title::after {
      content: ""; display: block; width: 46mm; height: 3mm; margin: 2mm auto 0;
      background:
        radial-gradient(circle, ${a} 0 0.9mm, transparent 1mm) center / 3mm 3mm no-repeat,
        linear-gradient(${a}, ${a}) left center / 19mm 0.7px no-repeat,
        linear-gradient(${a}, ${a}) right center / 19mm 0.7px no-repeat;
    }
    .title-band .recipe-title {
      background: ${a}; color: #ffffff; padding: 3mm 5mm; border-radius: 1.5mm;
    }
    .layout-fiche-technique.title-band .recipe-title { border-bottom: none; }
    /* Mises en page alignées à gauche : l'ornement suit le titre */
    .layout-moderne .recipe-title::after,
    .layout-magazine .recipe-title::after,
    .layout-fiche-technique .recipe-title::after { margin-left: 0; }

    /* ─── Étapes en pastilles ─── */
    .steps-circles .steps-rich > p { padding-left: 9mm; }
    .steps-circles .steps-rich > p::before {
      content: counter(step); top: 0.05em; width: 5.4mm; height: 5.4mm; min-width: 0;
      border-radius: 50%; background: ${a}; color: #ffffff; text-align: center;
      font-size: ${v.baseSize - 1.5}pt; line-height: 5.4mm; font-weight: 700;
    }

    /* ─── Ingrédients ─── */
    /* Nom, pointillés et quantité alignés sur la DERNIÈRE ligne du nom */
    .ing-leaders .ing-item { align-items: flex-end; }
    .ing-leaders .ing-item .ing-name { order: 1; flex: 0 1 auto; }
    .ing-leaders .ing-item::after {
      content: ""; order: 2; flex: 1 0 6mm;
      border-bottom: 1.2px dotted ${muted}; margin: 0 1.5mm 1.1mm;
    }
    .ing-leaders .ing-item .ing-qty { order: 3; min-width: 0; text-align: right; }
    .ing-boxed:not(.layout-fiche-technique):not(.layout-magazine) .col-ing {
      background: ${hexToRgba(a, 0.06)}; border: 1px solid ${hexToRgba(a, 0.3)};
      border-radius: 3mm; padding: 4mm;
    }
  `;
}

/**
 * CSS propre à chaque mise en page (classe `layout-<slug>` sur <body>).
 * « classique » = styles de base ci-dessus, sans surcharge.
 */
function layoutCss(
  theme: CookbookTheme,
  v: { titleFont: string; baseSize: number; titleSize: number },
): string {
  const a = theme.accentColor;
  const muted = mute(theme.textColor);
  return `
    /* ─── Fiche technique : dense, tableau avec % de masse ─── */
    .layout-fiche-technique .recipe-title {
      text-align: left; text-transform: uppercase; letter-spacing: 0.03em;
      font-size: ${v.titleSize - 2}pt; margin: 0 0 2mm;
      border-bottom: 2px solid ${a}; padding-bottom: 1.5mm;
    }
    .layout-fiche-technique .recipe-categories,
    .layout-fiche-technique .tags-line,
    .layout-fiche-technique .subrecipe-of,
    .layout-fiche-technique .portion,
    .layout-fiche-technique .recipe-rating { text-align: left; }
    .fiche-label { display: flex; border: 1.5px solid ${a}; margin: 2mm 0 4mm; }
    .fiche-label > div { flex: 1; padding: 1.2mm 3mm; border-right: 1px solid ${a}; }
    .fiche-label > div:last-child { border-right: none; }
    .fiche-label .k {
      display: block; font-size: ${v.baseSize - 2}pt; color: ${muted};
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .fiche-label .v { font-weight: 700; }
    .layout-fiche-technique .columns { flex-direction: column; gap: 4mm; }
    .layout-fiche-technique .col-title {
      font-size: ${v.baseSize + 1}pt; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2mm;
    }
    .ing-table { width: 100%; border-collapse: collapse; font-size: ${v.baseSize - 0.5}pt; }
    .ing-table th {
      text-align: left; background: ${a}; color: #fff; padding: 1mm 2mm;
      font-size: ${v.baseSize - 1}pt; text-transform: uppercase; letter-spacing: 0.04em;
    }
    .ing-table td { padding: 0.9mm 2mm; border-bottom: 0.5px solid #dddddd; }
    .ing-table tbody tr:nth-child(even) td { background: #f5f5f5; }
    .ing-table .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .ing-table th.num { text-align: right; }
    .ing-table .pct { color: ${muted}; width: 16mm; }
    .ing-table td .ing-qty { color: ${theme.textColor}; }
    .ing-table tfoot td { font-weight: 700; color: ${a}; border-top: 1.5px solid ${a}; border-bottom: none; }
    .layout-fiche-technique .steps-rich > p { margin-bottom: 1.5mm; }

    /* ─── Moderne : une colonne, titre éditorial ─── */
    .layout-moderne .recipe-title {
      text-align: left; font-weight: 400; font-size: ${v.titleSize + 6}pt; margin: 2mm 0 2mm;
    }
    .layout-moderne.title-simple .recipe-title::after {
      content: ""; display: block; width: 18mm; height: 2px; background: ${a}; margin-top: 3mm;
    }
    .layout-moderne .recipe-categories,
    .layout-moderne .tags-line,
    .layout-moderne .subrecipe-of,
    .layout-moderne .portion,
    .layout-moderne .recipe-rating { text-align: left; }
    .layout-moderne .tag-chip { margin: 0 2mm 0 0; }
    .layout-moderne .columns { flex-direction: column; gap: 7mm; }
    .layout-moderne .col-title {
      font-size: ${v.baseSize}pt; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.14em; color: ${muted}; border-bottom: 1px solid #e2e2e2;
      padding-bottom: 1.5mm;
    }
    .layout-moderne .ing-list { column-count: 2; column-gap: 10mm; }
    .layout-moderne .ing-item { break-inside: avoid; }

    /* ─── Magazine : encadré ingrédients, lettrine ─── */
    .layout-magazine .recipe-title {
      text-align: left; font-size: ${v.titleSize + 8}pt; font-weight: 700; margin: 0 0 2mm;
    }
    .layout-magazine .recipe-categories,
    .layout-magazine .tags-line,
    .layout-magazine .subrecipe-of,
    .layout-magazine .portion,
    .layout-magazine .recipe-rating { text-align: left; }
    .layout-magazine .tag-chip { margin: 0 2mm 0 0; }
    .layout-magazine .col-ing {
      background: ${hexToRgba(a, 0.07)}; border-left: 3px solid ${a}; padding: 4mm;
    }
    .layout-magazine .steps-rich > p { padding-left: 0; }
    .layout-magazine .steps-rich > p::before { content: none; }
    .layout-magazine .steps-rich > p:first-child { display: flow-root; }
    .layout-magazine .steps-rich > p:first-child::first-letter {
      float: left; font-family: ${v.titleFont}; font-size: 3.4em; line-height: 0.85;
      font-weight: 700; color: ${a}; margin: 1mm 2mm 0 0;
    }
  `;
}

// ─── Rendu des morceaux ──────────────────────────────────────────────────────

type PdfIngredient = { name: string; quantityG: number; quantityGMax?: number | null; unit?: string };

/**
 * Quantité affichée dans un PDF (QS, fourchette, équivalent g des cuillères),
 * dans UN seul bloc `.ing-qty` pour garder l'alignement de la colonne.
 */
function ingQtyHtml(i: PdfIngredient): string {
  const unit = i.unit ?? "g";
  if (unit === "QS") return `<span class="ing-qty ing-qs">QS</span>`;
  const factor = unit === "cc" ? 5 : unit === "cs" ? 15 : 0;
  let inner = formatQty(i.quantityG, unit);
  if (i.quantityGMax != null) inner += ` / ${formatQty(i.quantityGMax, unit)}`;
  if (factor) {
    const approx = i.quantityGMax != null
      ? `${formatG(i.quantityG * factor)}/${formatG(i.quantityGMax * factor)}`
      : formatG(i.quantityG * factor);
    inner += ` <span class="ing-unit-muted">(≈${approx})</span>`;
  }
  return `<span class="ing-qty">${inner}</span>`;
}

function totalText(totalMinG: number, totalMaxG: number): string {
  return totalMinG !== totalMaxG
    ? `${formatG(totalMinG)} / ${formatG(totalMaxG)}`
    : formatG(totalMinG);
}

/**
 * Mise en page « fiche technique » : tableau Quantité / Ingrédient / % de la
 * masse totale (le % n'est calculé que pour les ingrédients pesables).
 */
function renderIngredientsTable(
  items: PdfIngredient[],
  totalMinG: number,
  totalMaxG: number,
  showTotal: boolean,
  qtyAfter = false,
): string {
  const pair = (qty: string, name: string) => (qtyAfter ? name + qty : qty + name);
  const avgTotal = (totalMinG + totalMaxG) / 2;
  const rows = items
    .map((i) => {
      const { avg } = recipeMass([i]);
      const pct = avgTotal > 0 && avg > 0 ? ((avg / avgTotal) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " %" : "";
      const qty = `<td class="num">${ingQtyHtml(i)}</td>`;
      const name = `<td>${esc(i.name)}</td>`;
      return `<tr>${qtyAfter ? name + qty : qty + name}<td class="num pct">${pct}</td></tr>`;
    })
    .join("");
  const foot = showTotal && totalMinG > 0
    ? `<tfoot><tr>${pair(`<td class="num">${totalText(totalMinG, totalMaxG)}</td>`, "<td>Masse totale</td>")}<td class="num pct">100 %</td></tr></tfoot>`
    : "";
  const head = pair(`<th class="num">Quantité</th>`, "<th>Ingrédient</th>");
  return `<table class="ing-table"><thead><tr>${head}<th class="num">%</th></tr></thead><tbody>${rows}</tbody>${foot}</table>`;
}

function renderIngredients(
  items: PdfIngredient[],
  totalMinG: number,
  totalMaxG: number,
  showTotal: boolean,
): string {
  const list = items
    .map((i) => {
      const qty = ingQtyHtml(i);
      return `
      <div class="ing-item">
        ${qty}
        <span class="ing-name">${esc(i.name)}</span>
      </div>`;
    })
    .join("");
  const totalLine = showTotal && totalMinG > 0
    ? `<div class="total-line">Total · ${totalText(totalMinG, totalMaxG)}</div>`
    : "";
  return `<div class="ing-list">${list}</div>` + totalLine;
}


/**
 * Enlève « 1. », « 1) », « 1- », etc. en tout début de chaque <p>
 * (et tolère les espaces ou &nbsp;). Utile pour les anciennes recettes où
 * l'utilisateur avait tapé la numérotation à la main : la numérotation
 * automatique (CSS counters sur .steps-rich > p) prend désormais le relais.
 */
function stripLeadingStepNumberingInHtml(html: string): string {
  return html.replace(
    /<p([^>]*)>(?:\s|&nbsp;)*\d+\s*[.)\-]\s+/g,
    "<p$1>",
  );
}

/**
 * Vrai si la chaîne est effectivement vide une fois les balises HTML
 * et les entités d'espace retirées. Utile pour traiter `<p></p>` ou
 * `<p>&nbsp;</p>` (sortie typique d'un éditeur Tiptap vide) comme « pas
 * de contenu » et afficher un — à la place.
 */
export function isStepsHtmlEffectivelyEmpty(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const text = raw
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, "")
    .trim();
  return text.length === 0;
}

function renderSteps(raw: string): string {
  if (looksLikeHtml(raw)) {
    const sanitized = sanitizeRichText(raw);
    const cleaned = stripLeadingStepNumberingInHtml(sanitized);
    return `<div class="steps-rich">${cleaned}</div>`;
  }
  // Mode texte brut (legacy) : converti en <p> pour profiter aussi de la
  // numérotation auto via CSS.
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      // strip "1. " / "1) " / "1- " en début de ligne si présent
      const m = line.match(/^\d+\s*[.)\-]\s+(.+)$/);
      return m ? m[1] : line;
    });
  if (lines.length === 0) return "";
  const html = lines.map((l) => `<p>${esc(l)}</p>`).join("");
  return `<div class="steps-rich">${html}</div>`;
}

function renderRating(rating: number | null | undefined): string {
  if (!rating || rating < 1) return "";
  const stars = "★".repeat(Math.min(5, rating)) + "☆".repeat(Math.max(0, 5 - rating));
  return `<div class="recipe-rating">${stars}</div>`;
}

export function renderRecipeCard(
  snap: RecipeSnap,
  subrecipeMode: SubrecipeMode,
  /** Conservé pour compatibilité descendante (non utilisé : numérotation via footer Puppeteer). */
  _pageNum: number | null,
  portion: string,
  theme: CookbookTheme,
  /** Si défini, affiche « Sous-recette de · [nom] » sous le titre. */
  parentRecipeName?: string,
): string {
  // Le total est TOUJOURS recalculé à partir des ingrédients réellement
  // affichés, et non lu depuis le snapshot. Cela garantit que « Total · X »
  // = la somme des lignes ci-dessus, même pour des recettes figées dont la
  // masse a été modifiée après coup (les champs totalMassGMin/Max stockés
  // pouvaient être périmés → cf. ancien bug de masse totale incohérente).
  const { min: totalMinG, max: totalMaxG } = recipeMass(snap.ingredients);
  const layout = theme.recipeLayout;
  const ingHtml = snap.ingredients.length === 0
    ? "<p class='muted'>Aucun ingrédient.</p>"
    : layout === "fiche-technique"
      ? renderIngredientsTable(snap.ingredients, totalMinG, totalMaxG, theme.showTotalMass, theme.qtyPosition === "after")
      : renderIngredients(snap.ingredients, totalMinG, totalMaxG, theme.showTotalMass);

  // Cartouche d'en-tête (masse, nb d'ingrédients, date) : toujours en Fiche
  // technique, sur demande dans les autres modèles.
  const ficheLabelHtml = layout === "fiche-technique" || theme.showInfoBox
    ? `<div class="fiche-label">
        <div><span class="k">Masse totale</span><span class="v">${totalMinG > 0 ? totalText(totalMinG, totalMaxG) : "—"}</span></div>
        <div><span class="k">Ingrédients</span><span class="v">${snap.ingredients.length}</span></div>
        <div><span class="k">Date</span><span class="v">${new Date().toLocaleDateString("fr-FR")}</span></div>
      </div>`
    : "";

  const stepsHtml =
    snap.steps && !isStepsHtmlEffectivelyEmpty(snap.steps)
      ? renderSteps(snap.steps)
      : "<p class='muted'>—</p>";

  // Sous-recettes inline retirées : on rend toujours une recette par page.
  // L'argument `subrecipeMode` est conservé pour compat mais n'a plus d'effet.
  const subrecipesHtml = "";
  void subrecipeMode;

  const tags = snap.tags ?? [];
  const tagsHtml = theme.showTags && tags.length > 0
    ? `<div class="tags-line">${tags.map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("")}</div>`
    : "";

  const cats = snap.categories ?? [];
  const categoriesHtml = cats.length > 0
    ? `<div class="recipe-categories">${esc(cats.join(" · "))}</div>`
    : "";

  const ratingHtml = theme.showRating ? renderRating(snap.rating) : "";

  const portionHtml = theme.showPortion && portion
    ? `<div class="portion">Taille de portion: <span class="portion-value">${esc(portion)}</span></div>`
    : "";

  const sourceHtml = theme.showSource && snap.source
    ? `<div class="source">Source : ${esc(snap.source)}</div>`
    : "";

  const notesHtml = theme.showNotes && snap.notesTips
    ? `<div class="notes"><div class="notes-title">Notes & astuces</div>${esc(snap.notesTips)}</div>`
    : "";

  const parentLabelHtml = parentRecipeName
    ? `<div class="subrecipe-of">Sous-recette de · ${esc(parentRecipeName)}</div>`
    : "";

  return `
    <section class="recipe">
      <h2 class="recipe-title">${esc(snap.name)}</h2>
      ${parentLabelHtml}
      ${ficheLabelHtml}
      ${categoriesHtml}
      ${tagsHtml}
      ${ratingHtml}
      ${portionHtml}
      <div class="columns">
        <div class="col col-ing">
          <div class="col-title">Ingrédients</div>
          ${ingHtml}
        </div>
        <div class="col col-prep">
          <div class="col-title">Préparation</div>
          ${stepsHtml}
        </div>
      </div>
      ${subrecipesHtml}
      ${sourceHtml}
      ${notesHtml}
    </section>`;
}

// ─── Couverture ───────────────────────────────────────────────────────────────

export function renderCover(opts: {
  cookbookName: string;
  description?: string | null;
  theme: CookbookTheme;
}): string {
  const { cookbookName, description, theme } = opts;
  const layoutClass = `cover-${theme.coverLayout}`;
  const subtitle = description?.trim() || "";

  return `
    <div class="cover ${layoutClass}">
      <div class="cover-inner">
        <div class="cover-title">${esc(cookbookName)}</div>
        ${subtitle ? `<div class="cover-subtitle">${esc(subtitle)}</div>` : ""}
      </div>
    </div>`;
}

// ─── Sommaire ─────────────────────────────────────────────────────────────────

function renderToc(entries: TocEntry[], theme: CookbookTheme): string {
  if (entries.length === 0) return "";

  // Sommaire fixe en mode « liste plate » + numéros de page toujours affichés.
  const renderEntry = (e: TocEntry) => {
    const leader = theme.tocDots
      ? `<span class="toc-leader"></span>`
      : `<span class="toc-leader-empty"></span>`;
    const pageHtml = `<span class="toc-num">${e.pageNum}</span>`;
    let cls = "toc-entry";
    let labelStyle = "";
    let labelText = esc(e.name);
    if (e.isChapter) {
      labelStyle = ' style="font-weight:700;color:' + theme.accentColor + '"';
    } else if (e.isSubrecipe) {
      cls += " toc-entry-sub";
      labelText = `↳ ${labelText}`;
    }
    return `<div class="${cls}"${labelStyle}><span class="toc-label">${labelText}</span>${leader}${pageHtml}</div>`;
  };

  const body = entries.map(renderEntry).join("");

  return `
    <div class="toc">
      <div class="toc-section-title">${esc(theme.tocTitle)}</div>
      ${body}
    </div>`;
}

// ─── API publique ─────────────────────────────────────────────────────────────

function renderChapterPage(title: string, intro: string): string {
  return `
    <section class="chapter-page">
      <div class="chapter-title">${esc(title)}</div>
      <div class="chapter-rule"></div>
      ${intro ? `<div class="chapter-intro">${esc(intro)}</div>` : ""}
    </section>`;
}

/**
 * Sous-recettes d'une entrée, chacune rendue sur sa propre page.
 * Utilisé à la fois par le sommaire et par le rendu : l'ordre doit être identique.
 */
function subSnapsOf(entry: Extract<CookbookEntryUnion, { type: "recipe" }>): RecipeSnap[] {
  if (entry.separateSnaps && entry.separateSnaps.length > 0) return entry.separateSnaps;
  return entry.snap.subRecipes.map((sr): RecipeSnap => ({
    name: sr.label ?? sr.childName,
    source: null,
    notesTips: null,
    rating: null,
    photoPath: null,
    tags: [],
    categories: [],
    ingredients: sr.ingredients,
    steps: sr.steps,
    totalMassG: sr.totalMassG,
    totalMassGMin: sr.totalMassGMin,
    totalMassGMax: sr.totalMassGMax,
    subRecipes: [],
  }));
}

/**
 * Ancres du sommaire : chaque page listée au sommaire (chapitre, recette,
 * sous-recette) porte l'id `toc-<n>`, n = rang dans le sommaire. Des liens
 * invisibles vers ces ids obligent Chromium à écrire dans le PDF la page
 * réelle de chaque ancre ; `readAnchorPages` (renderer.ts) la relit ensuite
 * pour numéroter le sommaire exactement, même si une recette fait 2 pages.
 */
export const TOC_ANCHOR_PREFIX = "toc-";

function withAnchor(sectionHtml: string, index: number): string {
  return sectionHtml.replace("<section ", `<section id="${TOC_ANCHOR_PREFIX}${index}" `);
}

/**
 * Calcule, pour chaque entrée du cahier, son numéro de page LOGIQUE
 * (la 1ʳᵉ recette = page 1, la couverture et le sommaire ne sont pas comptés).
 */
type TocEntry = {
  name: string;
  pageNum: number;
  categories?: string[];
  isChapter?: boolean;
  /** Si vrai, l'entrée est une sous-recette à afficher indentée sous sa parente. */
  isSubrecipe?: boolean;
};

function computeTocEntries(
  entries: CookbookEntryUnion[],
  /** Pages réelles relevées dans le PDF des recettes (index = rang dans le sommaire). */
  realPages?: number[],
): TocEntry[] {
  let pageNumPreview = 1;
  const tocEntries: TocEntry[] = [];

  for (const entry of entries) {
    if (entry.type === "chapter") {
      tocEntries.push({
        name: entry.title,
        pageNum: pageNumPreview,
        isChapter: true,
      });
      pageNumPreview += 1;
      continue;
    }
    // Recette parente
    tocEntries.push({
      name: entry.snap.name,
      pageNum: pageNumPreview,
      categories: entry.snap.categories,
    });
    pageNumPreview += 1;

    // Sous-recettes indentées dessous
    for (const subName of subSnapsOf(entry).map((s) => s.name)) {
      tocEntries.push({
        name: subName,
        pageNum: pageNumPreview,
        isSubrecipe: true,
      });
      pageNumPreview += 1;
    }
  }
  // Estimation (1 page par entrée) remplacée par la page réelle quand elle est connue.
  if (realPages) {
    tocEntries.forEach((e, i) => {
      if (realPages[i] !== undefined) e.pageNum = realPages[i];
    });
  }
  return tocEntries;
}

/**
 * HTML de la couverture + sommaire UNIQUEMENT.
 * Rendu en pass séparé (sans pied de page Puppeteer) pour ne pas afficher
 * de numéro de page sur la couverture / le sommaire.
 */
export function buildCoverTocHtml(opts: {
  cookbookName: string;
  description?: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  theme?: CookbookTheme;
  entries: CookbookEntryUnion[];
  /** Pages réelles des entrées du sommaire (voir TOC_ANCHOR_PREFIX). */
  tocPages?: number[];
}): string {
  const { cookbookName, description, hasCover, hasToc, entries } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const format = opts.format;
  // Pas d'en-tête ni de pied de page dans ce pass.
  const margins = recipePageMargins(theme, { header: false, footer: false });
  const css = buildCss(theme, { format, bleedFirstPage: hasCover, margins });
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  let body = "";
  if (hasCover) body += renderCover({ cookbookName, description, theme });
  if (hasToc) body += renderToc(computeTocEntries(entries, opts.tocPages), theme);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}

/**
 * HTML des recettes (et chapitres) UNIQUEMENT.
 * Le numéro de page est rendu par Puppeteer dans le footer, ce qui garantit
 * qu'il commence bien à 1 sur la 1ʳᵉ recette du PDF final fusionné.
 */
export function buildRecipesHtml(opts: {
  format: "A4" | "A5";
  theme?: CookbookTheme;
  entries: CookbookEntryUnion[];
  hasFooter: boolean;
  hasHeader?: boolean;
}): string {
  const { entries, hasFooter } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const format = opts.format;
  // Marges élargies quand un en-tête / pied de page est rendu, pour lui réserver l'espace.
  const margins = recipePageMargins(theme, { header: !!opts.hasHeader, footer: hasFooter });
  const css = buildCss(theme, { format, margins });
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  let body = "";
  let anchor = 0; // rang dans le sommaire (même ordre que computeTocEntries)
  for (const entry of entries) {
    if (entry.type === "chapter") {
      body += withAnchor(renderChapterPage(entry.title, entry.intro), anchor++);
      continue;
    }
    if (entry.sectionTitle) {
      body += `<div class="section-title">${esc(entry.sectionTitle)}</div>`;
    }
    // Recette parente sur sa propre page.
    body += withAnchor(renderRecipeCard(entry.snap, "single", null, entry.portion ?? "", theme), anchor++);
    // Chaque sous-recette : sa propre page, avec mention « Sous-recette de · [parent] ».
    for (const sub of subSnapsOf(entry)) {
      body += withAnchor(renderRecipeCard(sub, "single", null, "", theme, entry.snap.name), anchor++);
    }
  }
  // Liens invisibles vers chaque ancre (nécessaires pour que Chromium
  // enregistre la page de destination dans le PDF).
  const links = Array.from({ length: anchor }, (_, i) => `<a href="#${TOC_ANCHOR_PREFIX}${i}">.</a>`).join("");
  body = `<div style="position:absolute;top:0;left:0;width:1px;height:1px;overflow:hidden;opacity:0">${links}</div>` + body;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>${css}</style>
</head>
<body class="${bodyClass(theme)}">${body}</body>
</html>`;
}

export function buildSingleRecipeHtml(
  snap: RecipeSnap,
  format: "A4" | "A5" = "A4",
  theme: CookbookTheme = DEFAULT_THEME,
  chrome: { header: boolean; footer: boolean } = { header: false, footer: true },
): string {
  // 1ʳᵉ recette : pas de saut de page avant (`page-break-before: auto`).
  // Sous-recettes : saut de page automatique grâce au CSS .recipe par défaut
  // (`page-break-before: always`).
  let css = buildCss(theme, { format, margins: recipePageMargins(theme, chrome) });
  css = css.replace("page-break-before: always;", "page-break-before: auto;");
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  // Recette parente : on supprime le saut de page initial (.recipe-first).
  // Sous-recettes : chacune est une carte indépendante avec saut de page.
  const parentCard = renderRecipeCard(snap, "single", null, "", theme);
  const subCards = snap.subRecipes
    .map((sr) => {
      // Convertit le format SubRecipe en RecipeSnap minimal pour réutiliser renderRecipeCard
      const subSnap: RecipeSnap = {
        name: sr.label ?? sr.childName,
        source: null,
        notesTips: null,
        rating: null,
        photoPath: null,
        tags: [],
        categories: [],
        ingredients: sr.ingredients,
        steps: sr.steps,
        totalMassG: sr.totalMassG,
        totalMassGMin: sr.totalMassGMin,
        totalMassGMax: sr.totalMassGMax,
        subRecipes: [],
      };
      return renderRecipeCard(subSnap, "single", null, "", theme, snap.name);
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>
    ${css}
    /* Force la 1ʳᵉ recette à ne PAS commencer par un saut de page */
    body > section.recipe:first-child { page-break-before: auto; }
    /* Les recettes suivantes (les sous-recettes) commencent toujours sur une nouvelle page */
    body > section.recipe + section.recipe { page-break-before: always; }
  </style>
</head>
<body class="${bodyClass(theme)}">${parentCard}${subCards}</body>
</html>`;
}
