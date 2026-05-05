/**
 * Import depuis Recipe Keeper — format **HTML** (export "Recettes au format HTML").
 *
 * Le ZIP exporté par Recipe Keeper contient :
 *   - recipes.html  (tout en un, ~140 recettes par exemple)
 *   - images/<uuid>_0.jpg  (photos des recettes, référencées dans le HTML)
 *
 * Le HTML utilise des microdonnées (`itemprop="..."`) — parser super stable.
 *
 * Structure d'une recette :
 *   <div class="recipe-details">
 *     <meta itemprop="recipeId" content="..."/>
 *     <meta itemprop="recipeIsFavourite" content="True|False"/>
 *     <meta itemprop="recipeRating" content="0..5"/>
 *     <h2 itemprop="name">Nom</h2>
 *     <span itemprop="recipeCourse">...</span>
 *     <meta itemprop="recipeCategory" content="..."/>  (× n)
 *     <meta itemprop="recipeCollection" content="..."/> (× n)
 *     <span itemprop="recipeSource">...</span>
 *     <span itemprop="recipeYield">210g</span>
 *     <meta itemprop="prepTime" content="PT0S"/>
 *     <meta itemprop="cookTime" content="PT0S"/>
 *     <div class="recipe-ingredients" itemprop="recipeIngredients">
 *       <p>80g lait</p><p>...</p><p>210g Total</p>
 *     </div>
 *     <div itemprop="recipeDirections">
 *       <p>1.Étape</p><p></p><p>2.Étape</p>...
 *     </div>
 *     <div class="recipe-notes" itemprop="recipeNotes"><p>...</p></div>
 *     <img class="recipe-photo" src="images/<uuid>_0.jpg"/>
 *   </div>
 */

import { parseHTML } from "linkedom";
import { parseIngredientsText } from "./parseIngredientsText";

export type RKImage = {
  /** Chemin relatif dans le ZIP, ex. "images/<uuid>_0.jpg" */
  path: string;
};

export type RKHtmlRecipe = {
  name: string;
  source: string | null;
  notesTips: string | null;
  steps: string | null;
  ingredients: { name: string; quantityG: number }[];
  /** Toutes les "Catégories" Recipe Keeper + le "Plats" */
  categories: string[];
  /** "Les collections" Recipe Keeper → traités comme tags */
  tags: string[];
  favorite: boolean;
  rating: number | null;
  portionSize: string | null;
  /** Premières images référencées (chemins relatifs vers le ZIP) */
  images: RKImage[];
};

export function parseRecipeKeeperHtml(htmlText: string): RKHtmlRecipe[] {
  const { document } = parseHTML(htmlText);
  const recipeNodes = document.querySelectorAll("div.recipe-details");

  const recipes: RKHtmlRecipe[] = [];
  for (const node of Array.from(recipeNodes)) {
    const r = parseRecipeNode(node as Element);
    if (r) recipes.push(r);
  }
  return recipes;
}

// ─── Parser d'une recette ────────────────────────────────────────────────────

function parseRecipeNode(node: Element): RKHtmlRecipe | null {
  const get = (selector: string): string => {
    const el = node.querySelector(selector);
    if (!el) return "";
    if (el.tagName === "META") {
      return ((el as Element).getAttribute("content") ?? "").trim();
    }
    return el.textContent?.trim() ?? "";
  };

  const getAll = (selector: string): string[] => {
    const els = node.querySelectorAll(selector);
    return Array.from(els)
      .map((el) =>
        el.tagName === "META"
          ? ((el as Element).getAttribute("content") ?? "").trim()
          : (el.textContent?.trim() ?? ""),
      )
      .filter(Boolean);
  };

  const name = get('[itemprop="name"]');
  if (!name) return null;

  const source = get('[itemprop="recipeSource"]') || null;
  const portionSize = get('[itemprop="recipeYield"]') || null;
  const ratingStr = get('meta[itemprop="recipeRating"]');
  const favoriteStr = get('meta[itemprop="recipeIsFavourite"]');

  const rating =
    ratingStr && /^[0-9]+$/.test(ratingStr) && Number(ratingStr) > 0
      ? Math.min(5, Math.max(1, Number(ratingStr)))
      : null;
  const favorite = favoriteStr.toLowerCase() === "true";

  // Catégories : recipeCourse + recipeCategory (déduplique)
  const courses = getAll('[itemprop="recipeCourse"]');
  const cats = getAll('meta[itemprop="recipeCategory"]');
  const categories = dedup([...courses, ...cats]);

  // Collections → tags
  const tags = dedup(getAll('meta[itemprop="recipeCollection"]'));

  // Ingrédients : <p> dans .recipe-ingredients ; on filtre les vides et la ligne "Total"
  const ingNode = node.querySelector(
    'div.recipe-ingredients[itemprop="recipeIngredients"]',
  );
  const ingredients: { name: string; quantityG: number }[] = [];
  if (ingNode) {
    const paragraphs = Array.from(ingNode.querySelectorAll("p"))
      .map((p) => p.textContent?.trim() ?? "")
      .filter((t) => t.length > 0);
    const ingLines = paragraphs.filter((t) => !isTotalLine(t));
    if (ingLines.length > 0) {
      const parsed = parseIngredientsText(ingLines.join("\n"));
      ingredients.push(...parsed);
    }
  }

  // Étapes : <p> dans [itemprop=recipeDirections] ; on garde l'ordre, on filtre les vides
  const dirNode = node.querySelector('[itemprop="recipeDirections"]');
  let steps: string | null = null;
  if (dirNode) {
    const lines = Array.from(dirNode.querySelectorAll("p"))
      .map((p) => p.textContent?.trim() ?? "")
      .filter((t) => t.length > 0)
      .map(stripLeadingNumber);
    if (lines.length > 0) steps = lines.join("\n");
  }

  // Notes
  const notesNode = node.querySelector(
    'div.recipe-notes[itemprop="recipeNotes"]',
  );
  let notesTips: string | null = null;
  if (notesNode) {
    const lines = Array.from(notesNode.querySelectorAll("p"))
      .map((p) => p.textContent?.trim() ?? "")
      .filter((t) => t.length > 0);
    if (lines.length > 0) notesTips = lines.join("\n");
  }

  // Images : on garde la première recipe-photo (la principale) puis les recipe-photos
  const images: RKImage[] = [];
  const mainPhoto = node.querySelector("img.recipe-photo");
  if (mainPhoto) {
    const src = mainPhoto.getAttribute("src");
    if (src) images.push({ path: src });
  }
  const otherPhotos = node.querySelectorAll("img.recipe-photos");
  for (const img of Array.from(otherPhotos)) {
    const src = img.getAttribute("src");
    if (src) {
      // Évite les doublons (même image referencée comme principale + secondaire)
      if (!images.some((i) => i.path === src)) images.push({ path: src });
    }
  }

  return {
    name,
    source,
    notesTips,
    steps,
    ingredients,
    categories,
    tags,
    favorite,
    rating,
    portionSize,
    images,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedup<T extends string>(xs: T[]): T[] {
  return Array.from(new Set(xs.filter(Boolean)));
}

/** "210g Total", "Total : 210g", etc. */
function isTotalLine(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return /\btotal\b/.test(lower);
}

/** "1.Étape de préparation" → "Étape de préparation" */
function stripLeadingNumber(line: string): string {
  return line.replace(/^\s*\d+\s*[.)\-]\s*/, "");
}
