import { sanitizeRichText, looksLikeHtml } from "@/lib/sanitizeRichText";
import { parseStepLines } from "@/lib/stepLines";

/**
 * Affiche le bloc d'étapes d'une recette, en étapes numérotées.
 * Deux formats coexistent en base : l'ancien HTML (éditeur Tiptap, un
 * paragraphe par étape) et le texte brut actuel (une étape par ligne,
 * « # » en début de ligne pour un intertitre).
 */
export function StepsContent({
  content,
  fontSize = "14px",
}: {
  content: string;
  fontSize?: string;
}) {
  if (looksLikeHtml(content)) {
    return (
      <div
        className="rte-content rte-steps"
        style={{ fontSize, lineHeight: 1.6 }}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(content) }}
      />
    );
  }
  const lines = parseStepLines(content);
  return (
    <div style={{ fontSize }}>
      {lines.map((l, i) =>
        l.kind === "title" ? (
          <h3 className="step-title" key={i}>{l.text}</h3>
        ) : (
          <div className="step-line" key={i}>
            <b className="no">{l.no}</b>
            <span style={{ whiteSpace: "pre-wrap", minWidth: 0 }}>{l.text}</span>
          </div>
        ),
      )}
    </div>
  );
}
