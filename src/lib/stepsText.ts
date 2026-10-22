/**
 * Convertit d'anciennes étapes stockées en HTML (ancien éditeur Tiptap) en
 * texte simple, une étape par ligne. Les recettes déjà saisies restent donc
 * lisibles et éditables dans la zone de texte. Le texte simple est aussi
 * accepté tel quel (aucune balise → renvoyé inchangé).
 */
export function htmlToPlainText(input: string): string {
  if (!input) return "";
  // Pas de balise → déjà du texte simple.
  if (!/<[a-z][\s\S]*>/i.test(input)) return input;

  let text = input;
  // Sauts de ligne explicites
  text = text.replace(/<br\s*\/?>/gi, "\n");
  // Fin de bloc → saut de ligne
  text = text.replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n");
  // Toutes les autres balises → supprimées
  text = text.replace(/<[^>]+>/g, "");
  // Décodage des entités courantes
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  // Nettoyage : retire « 1. » / « 1) » en début de ligne (renuméroté au PDF),
  // espaces superflus, et compacte les lignes vides multiples.
  text = text
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\s*[.)]\s+/, "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}
