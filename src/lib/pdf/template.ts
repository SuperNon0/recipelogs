import type { RecipeSnapshot } from "@/lib/cookbooks";
import {
  type CookbookTheme,
  DEFAULT_THEME,
  FONT_FAMILIES,
  TEXT_SIZE_PT,
  TITLE_SIZE_PT,
  MARGIN_MM,
} from "./theme";

/**
 * Slug historique conservé pour compatibilité descendante.
 * Le rendu réel est piloté par le `theme` (CookbookTheme).
 */
export type TemplateSlug = "classique" | "moderne" | "fiche-technique" | "magazine";
type SubrecipeMode = "single" | "separate";

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

// ─── CSS dépendant du thème ───────────────────────────────────────────────────

function buildCss(theme: CookbookTheme): string {
  const titleFont = FONT_FAMILIES[theme.titleFont];
  const bodyFont = FONT_FAMILIES[theme.bodyFont];
  const baseSize = TEXT_SIZE_PT[theme.textSize];
  const titleSize = TITLE_SIZE_PT[theme.textSize];
  const margin = MARGIN_MM[theme.marginSize];

  const ingFlex =
    theme.ingredientsRatio === "narrow"
      ? "0 0 38%"
      : theme.ingredientsRatio === "balanced"
        ? "0 0 50%"
        : "0 0 60%";

  // Direction de la rangée 2 colonnes selon position des ingrédients
  const colsDirection =
    theme.ingredientsPosition === "right" ? "row-reverse" : "row";
  const stackedColumns = theme.ingredientsPosition === "top";

  return `
    @page { margin: ${margin}mm ${margin + 2}mm; size: A4; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${bodyFont};
      font-size: ${baseSize}pt;
      color: ${theme.textColor};
      background: ${theme.bgColor};
      line-height: 1.5;
    }
    /* Couverture */
    .cover {
      display: flex; align-items: center; justify-content: center;
      height: 100vh; width: 100%;
      page-break-after: always;
      background: linear-gradient(135deg, #d35a4a 0%, #f0c95a 33%, #84c46a 66%, #6ea8d8 100%);
      position: relative;
    }
    .cover-circle {
      width: 220px; height: 220px;
      background: ${theme.bgColor};
      border-radius: 50%;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 18px;
    }
    .cover-title {
      font-family: ${titleFont};
      font-size: ${titleSize + 6}pt; font-weight: 700;
      color: ${theme.textColor}; line-height: 1.05;
    }
    .cover-subtitle {
      font-size: ${baseSize + 2}pt; color: ${mute(theme.textColor)}; margin-top: 6px;
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
    .recipe-meta {
      font-size: ${baseSize}pt; color: ${mute(theme.textColor)};
      text-align: center; margin-bottom: 1.5mm;
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
      margin-bottom: 2mm;
      line-height: 1.35;
    }
    .ing-item .ing-name { display: block; }
    .ing-item .ing-qty { display: block; color: ${shade(theme.textColor, 0.3)}; }
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

/** Couleur "atténuée" : mélange vers gris à ~50%. */
function mute(hex: string, amount = 0.5): string {
  const c = hexToRgb(hex);
  if (!c) return "#888";
  const r = Math.round(c.r + (136 - c.r) * amount);
  const g = Math.round(c.g + (136 - c.g) * amount);
  const b = Math.round(c.b + (136 - c.b) * amount);
  return `rgb(${r},${g},${b})`;
}

/** Mélange vers gris léger pour les variations subtiles. */
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

// ─── Helpers de rendu ─────────────────────────────────────────────────────────

function renderIngredients(items: { name: string; quantityG: number }[], totalG: number, showTotal: boolean): string {
  const list = items
    .map(
      (i) => `
      <div class="ing-item">
        <span class="ing-name">${esc(i.name)}</span>
        <span class="ing-qty">- ${formatG(i.quantityG)}</span>
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

function renderRecipeCard(
  snap: NonNullable<RecipeSnapshot>,
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
    // Groupe par première catégorie (ou "Autres")
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
    snap: NonNullable<RecipeSnapshot>;
    subrecipeMode: SubrecipeMode;
    separateSnaps?: NonNullable<RecipeSnapshot>[];
    portion?: string;
  }[];
}): string {
  const { cookbookName, description, footer, hasCover, hasToc, entries } = opts;
  const theme = opts.theme ?? DEFAULT_THEME;
  const css = buildCss(theme);

  let body = "";

  // Couverture
  if (hasCover) {
    body += `
      <div class="cover">
        <div class="cover-circle">
          <div class="cover-title">${esc(cookbookName)}</div>
          ${description ? `<div class="cover-subtitle">${esc(description)}</div>` : ""}
        </div>
      </div>`;
  }

  // Sommaire (avant les pages de recettes)
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

  // Recettes (numérotage continu)
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

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>
  ${body}
  ${footerHtml}
</body>
</html>`;
}

export function buildSingleRecipeHtml(
  snap: NonNullable<RecipeSnapshot>,
  format: "A4" | "A5" = "A4",
  theme: CookbookTheme = DEFAULT_THEME,
): string {
  // Pas de saut de page forcé pour une recette seule
  const css = buildCss(theme).replace("page-break-before: always;", "page-break-before: auto;");
  const card = renderRecipeCard(snap, "single", null, "", theme);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>${card}</body>
</html>`;
}
