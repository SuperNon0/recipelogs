import {
  type CookbookTheme,
  type CoverBgPattern,
  DEFAULT_THEME,
  FONTS,
  titleSizeFor,
  googleFontsHref,
} from "./theme";
import { sanitizeRichText, looksLikeHtml } from "../sanitizeRichText";

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
  ingredients: { name: string; quantityG: number }[];
  steps: string | null;
  totalMassG: number;
  subRecipes: {
    label: string | null;
    childName: string;
    ingredients: { name: string; quantityG: number }[];
    totalMassG: number;
    steps: string | null;
  }[];
  multiplier?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatG(g: number): string {
  if (g >= 1000) return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

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
  const titleSize = titleSizeFor(theme.textSize);

  // Réglages désormais fixes (retirés de l'UI) :
  // ingrédients toujours à gauche en colonne étroite.
  const ingFlex = "0 0 38%";
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
      background: #ffffff;
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
    }
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
      border-top: 2px solid ${theme.accentColor}33;
    }
    .subrecipe-title {
      font-family: ${titleFont};
      font-size: ${baseSize + 3}pt; font-weight: 700; color: ${theme.accentColor};
      margin-bottom: 2mm;
    }
    .muted { color: ${mute(theme.textColor)}; font-style: italic; }
  `;
}

// ─── Rendu des morceaux ──────────────────────────────────────────────────────

function renderIngredients(items: { name: string; quantityG: number }[], totalG: number, showTotal: boolean): string {
  const list = items
    .map(
      (i) => `
      <div class="ing-item">
        <span class="ing-qty">${formatG(i.quantityG)}</span>
        <span class="ing-name">${esc(i.name)}</span>
      </div>`,
    )
    .join("");
  const totalLine = showTotal && totalG > 0
    ? `<div class="total-line">Total · ${formatG(totalG)}</div>`
    : "";
  return list + totalLine;
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
  const ingHtml = snap.ingredients.length > 0
    ? renderIngredients(snap.ingredients, snap.totalMassG, theme.showTotalMass)
    : "<p class='muted'>Aucun ingrédient.</p>";

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

function renderToc(
  entries: {
    name: string;
    pageNum: number;
    categories?: string[];
    isChapter?: boolean;
  }[],
  theme: CookbookTheme,
): string {
  if (entries.length === 0) return "";

  // Sommaire fixe en mode « liste plate » + numéros de page toujours affichés.
  const renderEntry = (label: string, page: number, isChapter?: boolean) => {
    const leader = theme.tocDots
      ? `<span class="toc-leader"></span>`
      : `<span class="toc-leader-empty"></span>`;
    const pageHtml = `<span class="toc-num">${page}</span>`;
    const labelStyle = isChapter
      ? ' style="font-weight:700;color:' + theme.accentColor + '"'
      : "";
    return `<div class="toc-entry"${labelStyle}><span class="toc-label">${esc(label)}</span>${leader}${pageHtml}</div>`;
  };

  const body = entries.map((e) => renderEntry(e.name, e.pageNum, e.isChapter)).join("");

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
 * Calcule, pour chaque entrée du cahier, son numéro de page LOGIQUE
 * (la 1ʳᵉ recette = page 1, la couverture et le sommaire ne sont pas comptés).
 */
function computeTocEntries(entries: CookbookEntryUnion[]): {
  name: string;
  pageNum: number;
  categories?: string[];
  isChapter?: boolean;
}[] {
  let pageNumPreview = 1;
  const tocEntries: {
    name: string;
    pageNum: number;
    categories?: string[];
    isChapter?: boolean;
  }[] = [];

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
    tocEntries.push({
      name: entry.snap.name,
      pageNum: pageNumPreview,
      categories: entry.snap.categories,
    });
    // 1 page pour la parente + 1 page par sous-recette (toujours séparées).
    const subCount = entry.separateSnaps?.length ?? entry.snap.subRecipes.length;
    pageNumPreview += 1 + subCount;
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
}): string {
  const { cookbookName, description, hasCover, hasToc, entries } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const format = opts.format;
  // Pas de marge basse réservée au footer : ce pass ne porte pas de footer.
  const margins = { top: 10, right: 12, bottom: 10, left: 12 };
  const css = buildCss(theme, { format, bleedFirstPage: hasCover, margins });
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  let body = "";
  if (hasCover) body += renderCover({ cookbookName, description, theme });
  if (hasToc) body += renderToc(computeTocEntries(entries), theme);

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
}): string {
  const { entries, hasFooter } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const format = opts.format;
  // Marge basse élargie quand un pied de page est rendu pour réserver l'espace.
  const margins = hasFooter
    ? { top: 10, right: 12, bottom: 16, left: 12 }
    : { top: 10, right: 12, bottom: 10, left: 12 };
  const css = buildCss(theme, { format, margins });
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  let body = "";
  for (const entry of entries) {
    if (entry.type === "chapter") {
      body += renderChapterPage(entry.title, entry.intro);
      continue;
    }
    if (entry.sectionTitle) {
      body += `<div class="section-title">${esc(entry.sectionTitle)}</div>`;
    }
    // Recette parente sur sa propre page.
    body += renderRecipeCard(entry.snap, "single", null, entry.portion ?? "", theme);
    // Chaque sous-recette : sa propre page, avec mention « Sous-recette de · [parent] ».
    // On utilise soit separateSnaps déjà construit côté route, soit on dérive
    // depuis snap.subRecipes.
    const subs = entry.separateSnaps && entry.separateSnaps.length > 0
      ? entry.separateSnaps
      : entry.snap.subRecipes.map((sr): RecipeSnap => ({
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
          subRecipes: [],
        }));
    for (const sub of subs) {
      body += renderRecipeCard(sub, "single", null, "", theme, entry.snap.name);
    }
  }

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

export function buildSingleRecipeHtml(
  snap: RecipeSnap,
  format: "A4" | "A5" = "A4",
  theme: CookbookTheme = DEFAULT_THEME,
): string {
  // 1ʳᵉ recette : pas de saut de page avant (`page-break-before: auto`).
  // Sous-recettes : saut de page automatique grâce au CSS .recipe par défaut
  // (`page-break-before: always`).
  let css = buildCss(theme, { format });
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
<body>${parentCard}${subCards}</body>
</html>`;
}
