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
      grouped?: boolean;
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

function numberSteps(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const alreadyNumbered = lines.every((l) => /^\d+[.)]\s/.test(l));
  if (alreadyNumbered) return lines.join("\n");
  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
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
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><polygon points='0,0 200,0 0,200' fill='${encodeURIComponent(theme.accentColor)}' fill-opacity='0.55'/></svg>`;
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

export function buildCss(theme: CookbookTheme): string {
  const titleFont = (FONTS[theme.titleFont] ?? FONTS.arial).family;
  const bodyFont = (FONTS[theme.bodyFont] ?? FONTS.arial).family;
  const baseSize = theme.textSize;
  const titleSize = titleSizeFor(theme.textSize);

  const ingFlex =
    theme.ingredientsRatio === "narrow"
      ? "0 0 38%"
      : theme.ingredientsRatio === "balanced"
        ? "0 0 50%"
        : "0 0 60%";

  const colsDirection = theme.ingredientsPosition === "right" ? "row-reverse" : "row";
  const stackedColumns = theme.ingredientsPosition === "top";
  const coverBg = coverBackgroundCss(theme);

  return `
    /* Pas de @page size : Puppeteer applique le format A4/A5 via son API.
       Pas de margin non plus : géré par Puppeteer. */
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
      color: #111111;
      border-radius: 50%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 8mm;
    }
    .cover-circle .cover-title { color: #111111; }
    .cover-circle .cover-subtitle { color: #666666; }

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
    /* Recette "collée" à la précédente : pas de saut de page */
    .recipe.recipe-grouped {
      page-break-before: auto;
      margin-top: 8mm;
      padding-top: 6mm;
      border-top: 1px solid ${mute(theme.textColor, 0.7)};
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
    .steps-rich { line-height: 1.55; }
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
    .page-num {
      position: absolute;
      bottom: 0; right: 0;
      font-size: ${baseSize - 0.5}pt; color: ${theme.textColor};
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

function renderSteps(raw: string): string {
  if (looksLikeHtml(raw)) {
    return `<div class="steps-rich">${sanitizeRichText(raw)}</div>`;
  }
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
  options: { grouped?: boolean } = {},
): string {
  const ingHtml = snap.ingredients.length > 0
    ? renderIngredients(snap.ingredients, snap.totalMassG, theme.showTotalMass)
    : "<p class='muted'>Aucun ingrédient.</p>";

  const stepsHtml = snap.steps ? renderSteps(snap.steps) : "<p class='muted'>—</p>";

  let subrecipesHtml = "";
  if (subrecipeMode === "single" && snap.subRecipes.length > 0) {
    subrecipesHtml = snap.subRecipes
      .map(
        (sr) => `
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
        </div>`,
      )
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

  const cls = options.grouped ? "recipe recipe-grouped" : "recipe";

  return `
    <section class="${cls}">
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
  if (theme.tocMode === "hidden" || entries.length === 0) return "";

  const renderEntry = (label: string, page: number, isChapter?: boolean) => {
    const leader = theme.tocDots
      ? `<span class="toc-leader"></span>`
      : `<span class="toc-leader-empty"></span>`;
    const pageHtml = theme.tocPageNumbers
      ? `<span class="toc-num">${page}</span>`
      : "";
    const labelStyle = isChapter
      ? ' style="font-weight:700;color:' + theme.accentColor + '"'
      : "";
    return `<div class="toc-entry"${labelStyle}><span class="toc-label">${esc(label)}</span>${leader}${pageHtml}</div>`;
  };

  let body = "";
  if (theme.tocMode === "by-section") {
    // Les chapitres ouvrent leur propre section dans le sommaire
    let currentSection: string | null = null;
    const groups: { title: string; entries: typeof entries }[] = [];
    let currentList: typeof entries = [];

    for (const e of entries) {
      if (e.isChapter) {
        if (currentList.length > 0) {
          groups.push({ title: currentSection ?? "Autres", entries: currentList });
        }
        currentSection = e.name;
        currentList = [];
      } else {
        const cat: string = (e.categories && e.categories[0]) || currentSection || "Autres";
        if (cat !== currentSection) {
          if (currentList.length > 0) {
            groups.push({ title: currentSection ?? "Autres", entries: currentList });
            currentList = [];
          }
          currentSection = cat;
        }
        currentList.push(e);
      }
    }
    if (currentList.length > 0) {
      groups.push({ title: currentSection ?? "Autres", entries: currentList });
    }

    for (const g of groups) {
      body += `<div class="toc-group-title"><span>${esc(g.title)}</span></div>`;
      body += g.entries.map((e) => renderEntry(e.name, e.pageNum, e.isChapter)).join("");
    }
  } else {
    body = entries.map((e) => renderEntry(e.name, e.pageNum, e.isChapter)).join("");
  }

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

export function buildCookbookHtml(opts: {
  cookbookName: string;
  description?: string | null;
  /** Pied de page : géré par Puppeteer (footerTemplate), pas dans le HTML body. */
  footer?: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  template?: TemplateSlug;
  theme?: CookbookTheme;
  entries: CookbookEntryUnion[];
}): string {
  const { cookbookName, description, hasCover, hasToc, entries } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const css = buildCss(theme);
  const fontsLink = googleFontsHref(theme);
  const fontsTag = fontsLink ? `<link rel="stylesheet" href="${fontsLink}" />` : "";

  let body = "";
  if (hasCover) body += renderCover({ cookbookName, description, theme });

  // Précalcul des numéros de page pour le sommaire
  if (hasToc) {
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
      const usesNewPage = !entry.grouped;
      if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
        pageNumPreview += (usesNewPage ? 1 : 0) + entry.separateSnaps.length;
      } else if (usesNewPage) {
        pageNumPreview += 1;
      }
    }
    body += renderToc(tocEntries, theme);
  }

  // Rendu des entrées
  let pageNum = 1;
  for (const entry of entries) {
    if (entry.type === "chapter") {
      body += renderChapterPage(entry.title, entry.intro);
      pageNum += 1;
      continue;
    }

    if (entry.sectionTitle) {
      body += `<div class="section-title">${esc(entry.sectionTitle)}</div>`;
    }

    const grouped = !!entry.grouped;
    if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
      body += renderRecipeCard(entry.snap, "single", pageNum, entry.portion ?? "", theme, { grouped });
      if (!grouped) pageNum += 1;
      for (const sub of entry.separateSnaps) {
        body += renderRecipeCard(sub, "single", pageNum, "", theme);
        pageNum += 1;
      }
    } else {
      body += renderRecipeCard(entry.snap, entry.subrecipeMode, pageNum, entry.portion ?? "", theme, { grouped });
      if (!grouped) pageNum += 1;
    }
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  ${fontsTag}
  <style>${css}</style>
</head>
<body>
  ${body}
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
