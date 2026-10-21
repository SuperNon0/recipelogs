import { sanitizeRichText, looksLikeHtml } from "@/lib/sanitizeRichText";

/**
 * Affiche le bloc d'étapes d'une recette, en étapes numérotées.
 * Deux formats coexistent en base : l'ancien HTML (éditeur Tiptap, un
 * paragraphe par étape) et le texte brut actuel (une étape par ligne).
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
  const steps = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // « 1. », « 2) », « - » en début de ligne : la numérotation est ajoutée ici.
    .map((l) => l.replace(/^(\d+\s*[.)-]|[-•*])\s+/, ""));
  return (
    <div style={{ fontSize }}>
      {steps.map((s, i) => (
        <div className="step-line" key={i}>
          <b className="no">{i + 1}</b>
          <span style={{ whiteSpace: "pre-wrap", minWidth: 0 }}>{s}</span>
        </div>
      ))}
    </div>
  );
}
