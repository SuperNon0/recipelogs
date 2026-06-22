import { NextResponse } from "next/server";
import { getShoppingListDetail } from "@/lib/shopping";
import { renderHtmlToPdf } from "@/lib/pdf/renderer";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const listId = Number(id);
  if (isNaN(listId)) return new NextResponse("Not found", { status: 404 });

  const list = await getShoppingListDetail(listId);
  if (!list) return new NextResponse("Not found", { status: 404 });

  const items = list.items.map((i) => ({
    name: i.name,
    quantityG: i.quantityG ? Number(i.quantityG) : null,
    checked: i.checked,
    recipeId: i.recipeId,
  }));

  const recipes = list.recipes.map((r) => r.recipe.name);

  const html = buildShoppingListHtml(list.name, items, recipes);
  const pdf = await renderHtmlToPdf(html, "A4");

  const filename = `liste_${list.name.replace(/[^a-z0-9\-]/gi, "_")}.pdf`;
  return new NextResponse(pdf.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function formatG(g: number): string {
  if (g >= 1000)
    return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildShoppingListHtml(
  listName: string,
  items: { name: string; quantityG: number | null; checked: boolean; recipeId: number | null }[],
  recipeNames: string[],
): string {
  const date = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const recipesHtml =
    recipeNames.length > 0
      ? `<div class="recipes-list">${recipeNames.map((n) => esc(n)).join(" · ")}</div>`
      : "";

  const itemsHtml = items
    .map((item) => {
      const qty = item.quantityG ? formatG(item.quantityG) : "";
      return `
        <tr class="${item.checked ? "checked" : ""}">
          <td class="check-col">☐</td>
          <td class="name-col">${esc(item.name)}</td>
          <td class="qty-col">${qty}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: A4; margin: 12mm 14mm 14mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, "Segoe UI", Arial, sans-serif;
      font-size: 10.5pt;
      color: #1a1a1a;
      line-height: 1.5;
    }
    .header {
      text-align: center;
      margin-bottom: 6mm;
      padding-bottom: 4mm;
      border-bottom: 2px solid #e8c547;
    }
    .title {
      font-size: 18pt;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 2mm;
    }
    .date {
      font-size: 9pt;
      color: #888;
    }
    .recipes-list {
      font-size: 9pt;
      color: #666;
      font-style: italic;
      margin-top: 2mm;
      line-height: 1.4;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4mm;
    }
    tr {
      border-bottom: 1px solid #eee;
    }
    td {
      padding: 2.2mm 2mm;
      vertical-align: middle;
    }
    .check-col {
      width: 8mm;
      text-align: center;
      color: #ccc;
      font-size: 11pt;
    }
    .name-col {
      font-size: 10.5pt;
    }
    .qty-col {
      text-align: right;
      font-weight: 600;
      color: #e8c547;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      width: 25mm;
    }
    tr.checked .name-col {
      text-decoration: line-through;
      color: #aaa;
    }
    .footer {
      margin-top: 8mm;
      padding-top: 3mm;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 8.5pt;
      color: #aaa;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">🛒 ${esc(listName)}</div>
    <div class="date">${esc(date)}</div>
    ${recipesHtml}
  </div>
  <table>
    ${itemsHtml}
  </table>
  <div class="footer">${items.length} article${items.length > 1 ? "s" : ""}</div>
</body>
</html>`;
}
