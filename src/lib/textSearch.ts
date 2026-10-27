/**
 * Recherche dans le texte des recettes (étapes, notes, commentaires) et par
 * ingrédient (sous-recettes comprises), sans tenir compte des accents ni des
 * majuscules. Pur : la route /api/search charge les données et appelle ceci.
 */

/** Normalise caractère par caractère (même longueur) : les positions trouvées restent valables dans le texte d'origine. */
export function foldChars(s: string): string {
  let out = "";
  for (const c of s) out += (c.normalize("NFD")[0] ?? c).toLowerCase().slice(0, 1).padEnd(c.length, " ");
  return out;
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Extrait d'environ `width` caractères autour du mot trouvé, ou null s'il n'y est pas. */
export function snippet(text: string, term: string, width = 70): { before: string; match: string; after: string } | null {
  const t = foldChars(term.trim());
  if (!t.trim()) return null;
  const flat = text.replace(/\s+/g, " ");
  const i = foldChars(flat).indexOf(t);
  if (i < 0) return null;
  const pad = Math.max(10, Math.floor((width - t.length) / 2));
  const from = Math.max(0, i - pad);
  const to = Math.min(flat.length, i + t.length + pad);
  return {
    before: (from > 0 ? "…" : "") + flat.slice(from, i),
    match: flat.slice(i, i + t.length),
    after: flat.slice(i + t.length, to) + (to < flat.length ? "…" : ""),
  };
}

/** Texte des étapes sans balises ni accolades de quantité liée, pour chercher et afficher un extrait. */
export function searchableText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\{\s*([^}]*)\}/g, "$1")
    .replace(/^#\s*/gm, "");
}

/** « jaunes + crème » → ["jaunes", "crème"] (plusieurs ingrédients à la fois). */
export function ingredientTerms(q: string): string[] {
  return q
    .split("+")
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export type IngredientUse = { recipeId: number; name: string; quantityG: number; unit: string };
export type SubLink = { parentId: number; childId: number; label: string };

/** Pour chaque terme : comment la recette l'utilise (directement « Jaune oeufs 160 g », ou via une sous-recette). */
export type IngredientHit = { term: string; name: string; quantityG: number | null; unit: string | null; via: string | null };

/**
 * Recettes qui contiennent TOUS les ingrédients cherchés, directement ou dans
 * une sous-recette (à tous les niveaux). Les sous-recettes trouvées sont
 * signalées par leur nom dans la recette (« via Crème pâtissière »).
 */
export function recipesWithIngredients(terms: string[], uses: IngredientUse[], links: SubLink[]): Map<number, IngredientHit[]> {
  const folded = terms.map(fold).filter(Boolean);
  const result = new Map<number, IngredientHit[]>();
  if (!folded.length) return result;

  // Utilisations directes par terme : recette → ligne d'ingrédient.
  const direct = folded.map((t) => {
    const m = new Map<number, IngredientUse>();
    for (const u of uses) if (fold(u.name).includes(t) && !m.has(u.recipeId)) m.set(u.recipeId, u);
    return m;
  });

  const childrenOf = new Map<number, SubLink[]>();
  for (const l of links) childrenOf.set(l.parentId, [...(childrenOf.get(l.parentId) ?? []), l]);

  // Première façon dont `recipeId` contient le terme n° k (directe, sinon via une sous-recette), anti-boucle.
  const find = (recipeId: number, k: number, seen: Set<number>): IngredientHit | null => {
    const d = direct[k].get(recipeId);
    if (d) return { term: terms[k], name: d.name, quantityG: d.quantityG, unit: d.unit, via: null };
    for (const l of childrenOf.get(recipeId) ?? []) {
      if (seen.has(l.childId)) continue;
      seen.add(l.childId);
      const h = find(l.childId, k, seen);
      if (h) return { term: terms[k], name: h.name, quantityG: null, unit: null, via: l.label };
    }
    return null;
  };

  const candidates = new Set<number>([...uses.map((u) => u.recipeId), ...links.map((l) => l.parentId)]);
  for (const id of candidates) {
    const hits: IngredientHit[] = [];
    for (let k = 0; k < folded.length; k++) {
      const h = find(id, k, new Set([id]));
      if (!h) break;
      hits.push(h);
    }
    if (hits.length === folded.length) result.set(id, hits);
  }
  return result;
}
