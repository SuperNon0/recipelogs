import { sanitizeRichText, looksLikeHtml } from "@/lib/sanitizeRichText";

/**
 * Affiche le bloc d'étapes d'une recette.
 * Deux formats coexistent en base : l'ancien HTML (éditeur Tiptap) et le
 * texte brut actuel (1 étape par ligne). Les deux sont gérés ici, pour que
 * la fiche, les sous-recettes et toute autre vue affichent la même chose.
 */
export function StepsContent({
  content,
  fontSize = "0.88rem",
}: {
  content: string;
  fontSize?: string;
}) {
  if (looksLikeHtml(content)) {
    return (
      <div
        className="rte-content"
        style={{ fontSize, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }}
      />
    );
  }
  return (
    <pre
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "var(--font-mono)",
        fontSize,
        lineHeight: 1.6,
      }}
    >
      {content}
    </pre>
  );
}
