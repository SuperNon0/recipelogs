import type { RecipeSnapshot } from "@/lib/cookbooks";

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

/** Numérote les étapes "1. ... 2. ..." si le texte n'est pas déjà numéroté. */
function numberSteps(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const alreadyNumbered = lines.every((l) => /^\d+[.)]\s/.test(l));
  if (alreadyNumbered) return lines.join("\n");

  return lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
}

// ─── Template "classique" (style BTM examen blanc) ────────────────────────────
//   - Sans-serif (Helvetica/Arial system stack)
//   - Couleur dominante : rouge profond #A52A2A
//   - 2 colonnes : Ingrédients | Préparation
//   - Ingrédients format "Nom\n- 200g"
//   - Étapes numérotées 1. 2. 3.

const CLASSIQUE_CSS = `
  @page { margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10pt;
    color: #111;
    background: #fff;
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
    background: #fff;
    border-radius: 50%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    text-align: center; padding: 18px;
  }
  .cover-title {
    font-size: 28pt; font-weight: 700;
    color: #111; line-height: 1.05;
  }
  .cover-subtitle {
    font-size: 12pt; color: #666; margin-top: 6px;
  }
  /* Sommaire */
  .toc { page-break-after: always; padding-top: 6mm; }
  .toc-section-title {
    font-size: 22pt; font-weight: 700; color: #A52A2A;
    text-align: center; margin-bottom: 12mm;
  }
  .toc-group-title {
    font-size: 14pt; font-weight: 700; color: #A52A2A;
    margin: 6mm 0 2mm 0;
    display: flex; justify-content: space-between;
  }
  .toc-entry {
    display: flex; justify-content: space-between;
    font-size: 10.5pt; padding: 1.2mm 0;
    color: #111;
  }
  .toc-entry .toc-num { color: #111; }
  /* Recette */
  .recipe {
    page-break-before: always;
    position: relative;
    min-height: 95vh;
  }
  .recipe-title {
    font-size: 22pt; font-weight: 700; color: #A52A2A;
    text-align: center; margin: 4mm 0 3mm;
    line-height: 1.15;
  }
  .recipe-tags {
    font-size: 10pt; color: #444;
    text-align: center; margin-bottom: 3mm;
  }
  .portion {
    font-size: 10pt; color: #A52A2A; font-weight: 700;
    text-align: center; margin-bottom: 6mm;
  }
  .portion-value { color: #111; font-weight: 400; }
  .columns {
    display: flex; gap: 6mm; margin-top: 3mm;
  }
  .col {
    flex: 1; min-width: 0;
  }
  .col-ing { flex: 0 0 38%; }
  .col-prep { flex: 1; }
  .col-title {
    font-size: 13pt; font-weight: 700; color: #A52A2A;
    margin-bottom: 3mm;
  }
  .ing-item {
    margin-bottom: 2mm;
    line-height: 1.35;
  }
  .ing-item .ing-name { display: block; }
  .ing-item .ing-qty { display: block; color: #333; }
  .total-line {
    margin-top: 4mm;
    padding-top: 1.5mm;
    border-top: 1px solid #A52A2A;
    font-weight: 700; color: #A52A2A;
  }
  .step {
    margin-bottom: 3mm;
    line-height: 1.5;
  }
  .step-num { font-weight: 700; }
  .source {
    font-size: 8.5pt; color: #888;
    font-style: italic; text-align: center;
    margin-top: 2mm;
  }
  .notes {
    font-size: 9pt; color: #444;
    margin-top: 6mm;
    padding-top: 3mm;
    border-top: 1px dashed #ccc;
    white-space: pre-wrap;
  }
  .notes-title {
    font-weight: 700; color: #A52A2A; margin-bottom: 1mm;
  }
  .subrecipe-block {
    margin-top: 6mm;
    padding-top: 3mm;
    border-top: 2px solid #A52A2A33;
  }
  .subrecipe-title {
    font-size: 13pt; font-weight: 700; color: #A52A2A;
    margin-bottom: 2mm;
  }
  .page-num {
    position: absolute;
    bottom: 0; right: 0;
    font-size: 9.5pt; color: #111;
  }
  .footer-note {
    position: fixed; bottom: 5mm; left: 0; right: 0;
    text-align: center; font-size: 7.5pt; color: #aaa;
  }
  .muted { color: #999; font-style: italic; }
`;

// ─── Helpers de rendu (style classique) ──────────────────────────────────────

function classiqueIngredients(items: { name: string; quantityG: number }[], totalG: number): string {
  const list = items
    .map(
      (i) => `
      <div class="ing-item">
        <span class="ing-name">${esc(i.name)}</span>
        <span class="ing-qty">- ${formatG(i.quantityG)}</span>
      </div>`,
    )
    .join("");

  const totalLine = totalG > 0
    ? `<div class="total-line">Total · ${formatG(totalG)}</div>`
    : "";

  return list + totalLine;
}

function classiqueSteps(raw: string): string {
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

function classiqueRecipeCard(
  snap: NonNullable<RecipeSnapshot>,
  subrecipeMode: SubrecipeMode,
  pageNum: number | null,
  tags: string,
  portion: string,
): string {
  const ingHtml = snap.ingredients.length > 0
    ? classiqueIngredients(snap.ingredients, snap.totalMassG)
    : "<p class='muted'>Aucun ingrédient.</p>";

  const stepsHtml = snap.steps
    ? classiqueSteps(snap.steps)
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
              ${classiqueIngredients(sr.ingredients, sr.totalMassG)}
            </div>
            <div class="col col-prep">
              <div class="col-title">Préparation</div>
              ${sr.steps ? classiqueSteps(sr.steps) : "<p class='muted'>—</p>"}
            </div>
          </div>
        </div>`)
      .join("");
  }

  const portionHtml = portion
    ? `<div class="portion">Taille de portion: <span class="portion-value">${esc(portion)}</span></div>`
    : "";

  const tagsHtml = tags
    ? `<div class="recipe-tags">${esc(tags)}</div>`
    : "";

  const sourceHtml = snap.source
    ? `<div class="source">Source : ${esc(snap.source)}</div>`
    : "";

  const notesHtml = snap.notesTips
    ? `<div class="notes"><div class="notes-title">Notes & astuces</div>${esc(snap.notesTips)}</div>`
    : "";

  const pageNumHtml = pageNum !== null
    ? `<div class="page-num">${pageNum}</div>`
    : "";

  return `
    <section class="recipe">
      <h2 class="recipe-title">${esc(snap.name)}</h2>
      ${tagsHtml}
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

// ─── API publique ──────────────────────────────────────────────────────────

function getCss(template: TemplateSlug): string {
  // Pour l'instant, classique uniquement (les autres viendront)
  // moderne/fiche-technique/magazine fallback sur classique
  return CLASSIQUE_CSS;
}

export function buildCookbookHtml(opts: {
  cookbookName: string;
  description?: string | null;
  footer?: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  template?: TemplateSlug;
  entries: {
    snap: NonNullable<RecipeSnapshot>;
    subrecipeMode: SubrecipeMode;
    separateSnaps?: NonNullable<RecipeSnapshot>[];
    portion?: string;
    tags?: string;
  }[];
}): string {
  const { cookbookName, description, footer, hasCover, hasToc, entries } = opts;
  const template: TemplateSlug = opts.template ?? "classique";
  const css = getCss(template);

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

  // Sommaire
  if (hasToc && entries.length > 0) {
    const tocEntries = entries
      .map(
        (e, i) =>
          `<div class="toc-entry"><span>${esc(e.snap.name)}</span><span class="toc-num">${i + 1}</span></div>`,
      )
      .join("");
    body += `
      <div class="toc">
        <div class="toc-section-title">Contenu</div>
        ${tocEntries}
      </div>`;
  }

  // Recettes (numérotage continu)
  let pageNum = 1;
  for (const entry of entries) {
    if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
      body += classiqueRecipeCard(entry.snap, "single", pageNum++, entry.tags ?? "", entry.portion ?? "");
      for (const sub of entry.separateSnaps) {
        body += classiqueRecipeCard(sub, "single", pageNum++, "", "");
      }
    } else {
      body += classiqueRecipeCard(entry.snap, entry.subrecipeMode, pageNum++, entry.tags ?? "", entry.portion ?? "");
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
  template: TemplateSlug = "classique",
): string {
  const css = getCss(template).replace("page-break-before: always;", "page-break-before: auto;");
  const card = classiqueRecipeCard(snap, "single", null, "", "");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>${card}</body>
</html>`;
}
