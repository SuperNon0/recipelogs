import { sanitizeRichText, looksLikeHtml } from "@/lib/sanitizeRichText";
import { parseStepLines } from "@/lib/stepLines";
import { scaleStepParts } from "@/lib/stepQty";

/**
 * Affiche le bloc d'étapes d'une recette, en étapes numérotées.
 * Deux formats coexistent en base : l'ancien HTML (éditeur Tiptap, un
 * paragraphe par étape) et le texte brut actuel (une étape par ligne,
 * « # » en début de ligne pour un intertitre).
 */
export function StepsContent({
  content,
  fontSize = "14px",
  coef = 1,
  wholeNumbers = false,
}: {
  content: string;
  fontSize?: string;
  /** Multiplicateur appliqué aux quantités liées (« {167 g} »). */
  coef?: number;
  /** Option « Entiers » du multiplicateur. */
  wholeNumbers?: boolean;
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
            <span style={{ whiteSpace: "pre-wrap", minWidth: 0 }}>
              {scaleStepParts(l.text, coef, wholeNumbers).map((p, j) =>
                typeof p === "string" ? p : <b key={j} className="step-qty">{p.qty}</b>,
              )}
            </span>
          </div>
        ),
      )}
    </div>
  );
}
