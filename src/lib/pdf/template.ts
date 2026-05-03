import {
  type CookbookTheme,
  type CoverLayout,
  type BgPattern,
  DEFAULT_THEME,
  FONTS,
  titleSizeFor,
  MARGIN_MM,
  googleFontsHref,
} from "./theme";

/**
 * Slug historique conservé pour compatibilité descendante.
 * Le rendu réel est piloté par le `theme` (CookbookTheme).
 */
export type TemplateSlug = "classique" | "moderne" | "fiche-technique" | "magazine";
type SubrecipeMode = "single" | "separate";

/**
 * Forme minimale d'un snapshot de recette, suffisante pour le rendu.
 * Définie localement pour garder ce module portable côté client (aperçu live).
 */
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

function numberSteps(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const alreadyNumbered = lines.every((l) => /^\d+[.)]\s/.test(l));
  if (alreadyNumbered) return lines.join("\n");

  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

/** Couleur "atténuée" : mélange vers gris à ~50%. */
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

/**
 * CSS du fond de page (recette + sommaire) selon le pattern choisi.
 * Tous les patterns sont 100% CSS / SVG-data-url, sans image externe,
 * compatibles avec Puppeteer pour le rendu PDF.
 */
export function backgroundCss(
  pattern: BgPattern,
  bg: string,
  accent: string,
  text: string,
  imageUrl: string,
  imageOpacity: number,
): string {
  switch (pattern) {
    case "plain":
      return `background: ${bg};`;

    case "gradient-soft":
      return `background: linear-gradient(180deg, ${bg} 0%, ${shade(bg, 0.08)} 100%);`;

    case "paper": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.95  0 0 0 0 0.92  0 0 0 0 0.85  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`;
      return `background: ${bg} url("data:image/svg+xml;utf8,${svg}") repeat;`;
    }

    case "lined": {
      const line = mute(text, 0.85);
      return `background: ${bg}; background-image: repeating-linear-gradient(0deg, transparent 0, transparent 7mm, ${line} 7mm, ${line} 7.05mm);`;
    }

    case "grid": {
      const line = mute(text, 0.9);
      return `background: ${bg}; background-image: linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px); background-size: 5mm 5mm;`;
    }

    case "dotted": {
      const dot = mute(text, 0.8);
      return `background: ${bg}; background-image: radial-gradient(${dot} 0.5px, transparent 0.5px); background-size: 4mm 4mm;`;
    }

    case "vintage":
      return `background: linear-gradient(135deg, #f6efdc 0%, #ecdfb8 100%); color: #3a2a18;`;

    case "accent-corner": {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><polygon points='0,0 200,0 0,200' fill='${encodeURIComponent(accent)}' fill-opacity='0.18'/></svg>`;
      return `background: ${bg} url("data:image/svg+xml;utf8,${svg}") no-repeat top left; background-size: 60mm 60mm;`;
    }

    case "image": {
      if (!imageUrl) return `background: ${bg};`;
      // Image en cover avec opacité réglable, par-dessus la couleur de fond.
      const a = Math.max(0, Math.min(1, 1 - imageOpacity));
      const overlay = hexToRgba(bg, a);
      return `background: linear-gradient(${overlay}, ${overlay}), url("${imageUrl.replace(/"/g, '%22')}") center / cover no-repeat, ${bg};`;
    }

    default:
      return `background: ${bg};`;
  }
}

/** "#fff" + 0.5 → "rgba(255,255,255,0.5)" */
function hexToRgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex);
  if (!c) return `rgba(255,255,255,${alpha})`;
  return `rgba(${c.r},${c.g},${c.b},${alpha})`;
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

// ─── CSS dépendant du thème ───────────────────────────────────────────────────

export function buildCss(theme: CookbookTheme): string {
  const titleFont = (FONTS[theme.titleFont] ?? FONTS.arial).family;
  const bodyFont = (FONTS[theme.bodyFont] ?? FONTS.arial).family;
  const baseSize = theme.textSize;
  const titleSize = titleSizeFor(theme.textSize);
  const margin = MARGIN_MM[theme.marginSize];

  // Fond de page (recette + sommaire)
  const bgCss = backgroundCss(
    theme.bgPattern,
    theme.bgColor,
    theme.accentColor,
    theme.textColor,
    theme.bgImageUrl,
    theme.bgImageOpacity,
  );

  const ingFlex =
    theme.ingredientsRatio === "narrow"
      ? "0 0 38%"
      : theme.ingredientsRatio === "balanced"
        ? "0 0 50%"
        : "0 0 60%";

  const colsDirection =
    theme.ingredientsPosition === "right" ? "row-reverse" : "row";
  const stackedColumns = theme.ingredientsPosition === "top";

  const coverBg = theme.coverGradient
    ? `linear-gradient(135deg, ${theme.coverBgColor} 0%, ${theme.coverBgColor2} 100%)`
    : theme.coverBgColor;

  return `
    @page { margin: ${margin}mm ${margin + 2}mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${bodyFont};
      font-size: ${baseSize}pt;
      color: ${theme.textColor};
      ${bgCss}
      line-height: 1.5;
    }

    /* Couverture — base */
    .cover {
      position: relative;
      width: 100%;
      height: 100vh;
      page-break-after: always;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: ${theme.coverTextColor};
    }
    .cover-title {
      font-family: ${titleFont};
      font-size: ${titleSize + 8}pt;
      font-weight: 700;
      line-height: 1.05;
      text-align: center;
    }
    .cover-subtitle {
      font-family: ${bodyFont};
      font-size: ${baseSize + 2}pt;
      margin-top: 6mm;
      opacity: 0.85;
      text-align: center;
    }

    /* Layout : cercle centré */
    .cover-circle { background: ${coverBg}; }
    .cover-circle .cover-inner {
      width: 78mm; height: 78mm;
      background: #fff;
      color: ${theme.textColor};
      border-radius: 50%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 8mm;
    }

    /* Layout : cadre centré */
    .cover-framed { background: ${coverBg}; }
    .cover-framed .cover-inner {
      border: 2px solid ${theme.coverTextColor};
      padding: 14mm 18mm;
      text-align: center;
    }

    /* Layout : bandeau haut */
    .cover-half-top { background: ${theme.bgColor}; }
    .cover-half-top::before {
      content: "";
      position: absolute; top: 0; left: 0; right: 0; height: 50%;
      background: ${coverBg};
    }
    .cover-half-top .cover-inner {
      position: relative;
      text-align: center;
      width: 80%;
      transform: translateY(-10mm);
    }

    /* Layout : bandeau bas */
    .cover-half-bottom { background: ${theme.bgColor}; }
    .cover-half-bottom::after {
      content: "";
      position: absolute; bottom: 0; left: 0; right: 0; height: 50%;
      background: ${coverBg};
    }
    .cover-half-bottom .cover-inner {
      position: relative;
      text-align: center;
      width: 80%;
      transform: translateY(10mm);
    }

    /* Layout : plein bleed */
    .cover-full-bleed { background: ${coverBg}; }
    .cover-full-bleed .cover-inner {
      text-align: center; padding: 20mm;
    }

    /* Layout : bannière fine */
    .cover-banner-top { background: ${theme.bgColor}; color: ${theme.textColor}; }
    .cover-banner-top::before {
      content: "";
      position: absolute; top: 0; left: 0; right: 0; height: 30mm;
      background: ${coverBg};
    }
    .cover-banner-top .cover-inner {
      position: relative;
      text-align: center;
      padding-top: 18mm;
    }

    /* Layout : minimaliste */
    .cover-minimal {
      background: ${theme.bgColor};
      color: ${theme.textColor};
    }
    .cover-minimal .cover-inner {
      text-align: center;
      border-top: 2px solid ${theme.accentColor};
      border-bottom: 2px solid ${theme.accentColor};
      padding: 8mm 14mm;
    }

    /* Layout : typo géante (titre énorme, pas de fond) */
    .cover-typo-large {
      background: ${theme.bgColor};
      color: ${theme.textColor};
    }
    .cover-typo-large .cover-inner {
      text-align: center;
      padding: 0 16mm;
    }
    .cover-typo-large .cover-title {
      font-size: ${titleSize + 24}pt;
      letter-spacing: -0.02em;
      color: ${theme.accentColor};
    }

    /* Layout : typo empilée (titre + sous-titre alignés à gauche) */
    .cover-typo-stacked {
      background: ${theme.bgColor};
      color: ${theme.textColor};
      align-items: flex-start;
      justify-content: flex-start;
    }
    .cover-typo-stacked .cover-inner {
      padding: 38mm 18mm 0;
      text-align: left;
      width: 100%;
    }
    .cover-typo-stacked .cover-title {
      text-align: left;
      font-size: ${titleSize + 16}pt;
      color: ${theme.accentColor};
      line-height: 1;
    }
    .cover-typo-stacked .cover-subtitle {
      text-align: left;
      margin-top: 4mm;
      font-style: italic;
    }

    /* Layout : typo + filets fins (pure typo, deux filets discrets) */
    .cover-typo-divider {
      background: ${theme.bgColor};
      color: ${theme.textColor};
    }
    .cover-typo-divider .cover-inner {
      text-align: center;
      padding: 0 18mm;
    }
    .cover-typo-divider .cover-inner::before,
    .cover-typo-divider .cover-inner::after {
      content: "";
      display: block;
      width: 30mm;
      height: 1px;
      background: ${theme.accentColor};
      margin: 8mm auto;
    }
    .cover-typo-divider .cover-title {
      font-size: ${titleSize + 10}pt;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    /* Sommaire */
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
    .toc-entry .toc-leader { flex: 1 1 auto; border-bottom: 1px dotted ${mute(theme.textColor)}; transform: translateY(-3px); margin: 0 4px; min-width: 8mm; }
    .toc-entry .toc-leader-empty { flex: 1 1 auto; }
    .toc-entry .toc-num { color: ${theme.textColor}; flex: 0 0 auto; }

    /* Recette */
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

    /* Ingrédients : "200g · Glaçage mix" sur une seule ligne */
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
    .step {
      margin-bottom: 3mm;
      line-height: 1.5;
    }
    .step-num { font-weight: 700; }
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
    .page-num {
      position: absolute;
      bottom: 0; right: 0;
      font-size: ${baseSize - 0.5}pt; color: ${theme.textColor};
    }
    .footer-note {
      position: fixed; bottom: 5mm; left: 0; right: 0;
      text-align: center; font-size: ${baseSize - 2.5}pt; color: ${mute(theme.textColor, 0.5)};
    }
    .muted { color: ${mute(theme.textColor)}; font-style: italic; }
  `;
}

// ─── Helpers de rendu ─────────────────────────────────────────────────────────

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

function renderSteps(raw: string): string {
  const numbered = numberSteps(raw);
  return numbered
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+[.)])\s+(.+)$/);
      if (m) {
        return `<div class="step"><span class="step-num">${esc(m[1])}</span> ${esc(m[2])}</div>`;
      }
      return `<div class="step">${esc(line)}</div>`;
    })
    .join("");
}

function renderRating(rating: number | null | undefined): string {
  if (!rating || rating < 1) return "";
  const stars = "★".repeat(Math.min(5, rating)) + "☆".repeat(Math.max(0, 5 - rating));
  return `<div class="recipe-rating">${stars}</div>`;
}

export function renderRecipeCard(
  snap: RecipeSnap,
  subrecipeMode: SubrecipeMode,
  pageNum: number | null,
  portion: string,
  theme: CookbookTheme,
): string {
  const ingHtml = snap.ingredients.length > 0
    ? renderIngredients(snap.ingredients, snap.totalMassG, theme.showTotalMass)
    : "<p class='muted'>Aucun ingrédient.</p>";

  const stepsHtml = snap.steps
    ? renderSteps(snap.steps)
    : "<p class='muted'>—</p>";

  let subrecipesHtml = "";
  if (subrecipeMode === "single" && snap.subRecipes.length > 0) {
    subrecipesHtml = snap.subRecipes
      .map((sr) => `
        <div class="subrecipe-block">
          <div class="subrecipe-title">${esc(sr.label ?? sr.childName)}</div>
          <div class="columns">
            <div class="col col-ing">
              <div class="col-title">Ingrédients</div>
              ${renderIngredients(sr.ingredients, sr.totalMassG, theme.showTotalMass)}
            </div>
            <div class="col col-prep">
              <div class="col-title">Préparation</div>
              ${sr.steps ? renderSteps(sr.steps) : "<p class='muted'>—</p>"}
            </div>
          </div>
        </div>`)
      .join("");
  }

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

  const pageNumHtml = theme.showPageNumbers && pageNum !== null
    ? `<div class="page-num">${pageNum}</div>`
    : "";

  return `
    <section class="recipe">
      <h2 class="recipe-title">${esc(snap.name)}</h2>
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
      ${pageNumHtml}
    </section>`;
}

// ─── Couverture ───────────────────────────────────────────────────────────────

export function renderCover(opts: {
  cookbookName: string;
  description?: string | null;
  theme: CookbookTheme;
}): string {
  const { cookbookName, description, theme } = opts;
  const layoutClass = `cover-${theme.coverLayout satisfies CoverLayout}`;
  const subtitle = theme.coverSubtitle?.trim() || description?.trim() || "";

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
  entries: { name: string; pageNum: number; categories?: string[] }[],
  theme: CookbookTheme,
): string {
  if (theme.tocMode === "hidden" || entries.length === 0) return "";

  const renderEntry = (label: string, page: number) => {
    const leader = theme.tocDots
      ? `<span class="toc-leader"></span>`
      : `<span class="toc-leader-empty"></span>`;
    const pageHtml = theme.tocPageNumbers
      ? `<span class="toc-num">${page}</span>`
      : "";
    return `<div class="toc-entry"><span class="toc-label">${esc(label)}</span>${leader}${pageHtml}</div>`;
  };

  let body = "";
  if (theme.tocMode === "by-section") {
    const groups = new Map<string, typeof entries>();
    for (const e of entries) {
      const key = (e.categories && e.categories[0]) || "Autres";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(e);
    }
    for (const [groupName, list] of groups.entries()) {
      body += `<div class="toc-group-title"><span>${esc(groupName)}</span></div>`;
      body += list.map((e) => renderEntry(e.name, e.pageNum)).join("");
    }
  } else {
    body = entries.map((e) => renderEntry(e.name, e.pageNum)).join("");
  }

  return `
    <div class="toc">
      <div class="toc-section-title">${esc(theme.tocTitle)}</div>
      ${body}
    </div>`;
}

// ─── API publique ──────────────────────────────────────────────────────────

export function buildCookbookHtml(opts: {
  cookbookName: string;
  description?: string | null;
  footer?: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  /** Conservé pour compatibilité, n'influence plus le rendu. */
  template?: TemplateSlug;
  theme?: CookbookTheme;
  entries: {
    snap: RecipeSnap;
    subrecipeMode: SubrecipeMode;
    separateSnaps?: RecipeSnap[];
    portion?: string;
  }[];
}): string {
  const { cookbookName, description, footer, hasCover, hasToc, entries } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const css = buildCss(theme);

  let body = "";

  if (hasCover) {
    body += renderCover({ cookbookName, description, theme });
  }

  if (hasToc) {
    let pageNumPreview = 1;
    const tocEntries: { name: string; pageNum: number; categories?: string[] }[] = [];
    for (const entry of entries) {
      tocEntries.push({
        name: entry.snap.name,
        pageNum: pageNumPreview,
        categories: entry.snap.categories,
      });
      if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
        pageNumPreview += 1 + entry.separateSnaps.length;
      } else {
        pageNumPreview += 1;
      }
    }
    body += renderToc(tocEntries, theme);
  }

  let pageNum = 1;
  for (const entry of entries) {
    if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
      body += renderRecipeCard(entry.snap, "single", pageNum++, entry.portion ?? "", theme);
      for (const sub of entry.separateSnaps) {
        body += renderRecipeCard(sub, "single", pageNum++, "", theme);
      }
    } else {
      body += renderRecipeCard(entry.snap, entry.subrecipeMode, pageNum++, entry.portion ?? "", theme);
    }
  }

  const footerHtml = footer ? `<div class="footer-note">${esc(footer)}</div>` : "";

  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>${css}</style>
</head>
<body>
  ${body}
  ${footerHtml}
</body>
</html>`;
}

export function buildSingleRecipeHtml(
  snap: RecipeSnap,
  format: "A4" | "A5" = "A4",
  theme: CookbookTheme = DEFAULT_THEME,
): string {
  const css = buildCss(theme).replace("page-break-before: always;", "page-break-before: auto;");
  const card = renderRecipeCard(snap, "single", null, "", theme);
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>${css}</style>
</head>
<body>${card}</body>
</html>`;
}
