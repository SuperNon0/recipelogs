/**
 * Sanitiseur minimal pour le HTML produit par Tiptap (étapes de recette).
 *
 * Politique :
 * - Tags autorisés : p, br, strong, b, em, i, u, s, del, mark, span,
 *   h3, h4, ul, ol, li, code, blockquote
 * - Attributs autorisés :
 *     • <span style="color: <hex|rgb>">
 *     • <mark style="background-color: <hex|rgb>">
 * - Tout le reste est strippé. Aucun <script>, <iframe>, on*=, javascript:.
 *
 * Approche : whitelist par regex. Suffisant pour notre cas car la source
 * est strictement Tiptap (pas de HTML utilisateur arbitraire).
 */

const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "b", "em", "i", "u", "s", "del",
  "mark", "span", "h3", "h4", "ul", "ol", "li", "code", "blockquote",
]);

const COLOR_RE = /^#[0-9a-fA-F]{3,6}$|^rgba?\([^)]+\)$/;

function sanitizeStyle(style: string, prop: "color" | "background-color"): string {
  // On ne garde qu'une seule propriété
  const match = style.match(new RegExp(`${prop}\\s*:\\s*([^;"]+)`, "i"));
  if (!match) return "";
  const value = match[1].trim();
  if (!COLOR_RE.test(value)) return "";
  return `${prop}: ${value}`;
}

/**
 * Nettoie le HTML d'entrée. Stratégie :
 * 1. Supprime totalement les tags <script>, <style>, <iframe>, <object>...
 * 2. Pour chaque tag rencontré : si pas dans la whitelist → strip ;
 *    sinon → on filtre les attributs.
 */
export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return "";

  // 1. Strip totalement les blocs dangereux (avec leur contenu)
  let html = input.replace(
    /<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  // Versions auto-fermantes
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "");

  // 2. Boucle sur tous les tags
  html = html.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/g, (full, rawName: string, attrs: string) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return "";

    const isClosing = full.startsWith("</");
    if (isClosing) return `</${name}>`;

    // Filtrer les attributs : on n'accepte que `style` sur span/mark
    let cleanAttrs = "";
    if ((name === "span" || name === "mark") && attrs) {
      const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i);
      if (styleMatch) {
        const styleVal = styleMatch[1] ?? styleMatch[2] ?? "";
        const prop = name === "span" ? "color" : "background-color";
        const safe = sanitizeStyle(styleVal, prop);
        if (safe) cleanAttrs = ` style="${safe}"`;
      }
    }

    return `<${name}${cleanAttrs}>`;
  });

  // 3. Strip les events handlers ou attributs résiduels qui auraient pu passer
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/javascript\s*:/gi, "");

  return html;
}

/**
 * Détecte si le contenu est du HTML enrichi ou du texte simple.
 * Permet de garder la rétrocompat avec les anciennes recettes en plain text.
 */
export function looksLikeHtml(content: string | null | undefined): boolean {
  if (!content) return false;
  return /<(p|h[1-6]|ul|ol|li|strong|em|u|s|mark|span|br)\b/i.test(content);
}
