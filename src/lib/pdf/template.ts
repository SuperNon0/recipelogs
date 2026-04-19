import type { RecipeSnapshot } from "@/lib/cookbooks";

type SubrecipeMode = "single" | "separate";

function formatG(g: number): string {
  if (g >= 1000) return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

function ingredientsTable(
  items: { name: string; quantityG: number }[],
  totalG: number,
): string {
  const rows = items
    .map(
      (i) => `
      <tr>
        <td class="ing-name">${esc(i.name)}</td>
        <td class="ing-qty">${formatG(i.quantityG)}</td>
        <td class="ing-pct">${totalG > 0 ? ((i.quantityG / totalG) * 100).toFixed(1) + " %" : "—"}</td>
      </tr>`,
    )
    .join("");

  return `
    <table class="ing-table">
      <thead>
        <tr>
          <th>Ingrédient</th>
          <th>Quantité</th>
          <th>%</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${formatG(totalG)}</td>
          <td>100 %</td>
        </tr>
      </tfoot>
    </table>`;
}

function recipeCard(snap: NonNullable<RecipeSnapshot>, subrecipeMode: SubrecipeMode): string {
  const mainIngHtml =
    snap.ingredients.length > 0
      ? ingredientsTable(snap.ingredients, snap.totalMassG)
      : "<p class='muted'>Aucun ingrédient.</p>";

  const stepsHtml = snap.steps
    ? `<h3 class="section-title">Étapes</h3><pre class="steps">${esc(snap.steps)}</pre>`
    : "";

  const notesTipsHtml = snap.notesTips
    ? `<h3 class="section-title">Notes & astuces</h3><p class="notes">${esc(snap.notesTips)}</p>`
    : "";

  const sourceHtml = snap.source
    ? `<p class="source">Source : ${esc(snap.source)}</p>`
    : "";

  let subrecipesHtml = "";
  if (subrecipeMode === "single" && snap.subRecipes.length > 0) {
    subrecipesHtml = snap.subRecipes
      .map(
        (sr) => `
        <div class="subrecipe-block">
          <h3 class="subrecipe-title">${esc(sr.label ?? sr.childName)}</h3>
          ${ingredientsTable(sr.ingredients, sr.totalMassG)}
          ${sr.steps ? `<pre class="steps">${esc(sr.steps)}</pre>` : ""}
        </div>`,
      )
      .join("");
  }

  return `
    <section class="recipe-card">
      <h2 class="recipe-title">${esc(snap.name)}</h2>
      ${sourceHtml}
      ${mainIngHtml}
      ${subrecipesHtml}
      ${stepsHtml}
      ${notesTipsHtml}
    </section>`;
}

function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10.5pt;
    color: #1a1a1a;
    background: #fff;
    line-height: 1.55;
  }
  .cookbook-cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    page-break-after: always;
  }
  .cover-title {
    font-size: 32pt;
    font-weight: bold;
    margin-bottom: 12px;
    color: #111;
  }
  .cover-desc {
    font-size: 13pt;
    color: #555;
    max-width: 400px;
  }
  .cover-date {
    margin-top: 24px;
    font-size: 10pt;
    color: #888;
  }
  .toc {
    page-break-after: always;
    padding: 20px 0;
  }
  .toc-title {
    font-size: 18pt;
    margin-bottom: 16px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 6px;
  }
  .toc-entry {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px dotted #ccc;
  }
  .recipe-card {
    page-break-before: always;
    padding: 0;
  }
  .recipe-title {
    font-size: 20pt;
    margin-bottom: 8px;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 6px;
    color: #111;
  }
  .source {
    font-size: 8.5pt;
    color: #888;
    margin-bottom: 14px;
    font-style: italic;
  }
  .section-title {
    font-size: 11pt;
    font-weight: bold;
    margin: 16px 0 6px;
    color: #333;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .ing-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
    font-size: 9.5pt;
  }
  .ing-table th {
    text-align: left;
    background: #f0f0f0;
    padding: 4px 8px;
    border: 1px solid #ddd;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ing-table td {
    padding: 3px 8px;
    border: 1px solid #e8e8e8;
  }
  .ing-table tfoot td {
    font-weight: bold;
    background: #f8f8f8;
  }
  .ing-qty, .ing-pct {
    text-align: right;
    white-space: nowrap;
  }
  .steps {
    font-family: 'Courier New', monospace;
    font-size: 9pt;
    white-space: pre-wrap;
    line-height: 1.6;
    background: #fafafa;
    border-left: 3px solid #ccc;
    padding: 10px 14px;
    margin-top: 6px;
    color: #222;
  }
  .notes {
    font-size: 9.5pt;
    color: #444;
    margin-top: 6px;
    white-space: pre-wrap;
  }
  .subrecipe-block {
    margin-top: 16px;
    padding: 12px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    background: #fdfdfb;
  }
  .subrecipe-title {
    font-size: 12pt;
    margin-bottom: 8px;
    color: #333;
  }
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8pt;
    color: #aaa;
    padding: 4px 0;
    border-top: 1px solid #eee;
  }
  .muted { color: #999; font-style: italic; font-size: 9pt; }
`;

export function buildCookbookHtml(opts: {
  cookbookName: string;
  description?: string | null;
  footer?: string | null;
  hasCover: boolean;
  hasToc: boolean;
  format: "A4" | "A5";
  entries: {
    snap: NonNullable<RecipeSnapshot>;
    subrecipeMode: SubrecipeMode;
    separateSnaps?: NonNullable<RecipeSnapshot>[];
  }[];
}): string {
  const { cookbookName, description, footer, hasCover, hasToc, entries } = opts;

  let body = "";

  if (hasCover) {
    body += `
      <div class="cookbook-cover">
        <div class="cover-title">${esc(cookbookName)}</div>
        ${description ? `<div class="cover-desc">${esc(description)}</div>` : ""}
        <div class="cover-date">${new Date().toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })}</div>
      </div>`;
  }

  if (hasToc && entries.length > 0) {
    const tocEntries = entries
      .map(
        (e, i) =>
          `<div class="toc-entry"><span>${esc(e.snap.name)}</span><span>${i + 1}</span></div>`,
      )
      .join("");
    body += `
      <div class="toc">
        <h2 class="toc-title">Table des matières</h2>
        ${tocEntries}
      </div>`;
  }

  for (const entry of entries) {
    if (entry.subrecipeMode === "separate" && entry.separateSnaps?.length) {
      body += recipeCard(entry.snap, "single");
      for (const sub of entry.separateSnaps) {
        body += recipeCard(sub, "single");
      }
    } else {
      body += recipeCard(entry.snap, entry.subrecipeMode);
    }
  }

  const footerHtml = footer
    ? `<div class="footer">${esc(footer)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${BASE_CSS}</style>
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
): string {
  const card = recipeCard(snap, "single");
  const css = BASE_CSS.replace("page-break-before: always;", "");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>${css}</style>
</head>
<body>${card}</body>
</html>`;
}
