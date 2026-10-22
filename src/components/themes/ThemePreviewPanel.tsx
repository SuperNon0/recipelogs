"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { ModalOverlay } from "@/components/ModalOverlay";
import { PdfPreview, usePdfFetch } from "@/components/PdfPreview";
import type { CookbookTheme } from "@/lib/pdf/theme";

export type RecipeChoice = { id: number; name: string };

/**
 * Aperçu PDF d'un thème (même non enregistré) sur une recette au choix.
 * Se régénère tout seul ~0,4 s après la dernière modification.
 * `expandable` : bouton pour l'ouvrir en grand, en plein écran.
 */
export function ThemePreviewPanel({
  config,
  format,
  recipes,
  auto = true,
  expandable = false,
}: {
  config: CookbookTheme;
  format: "A4" | "A5";
  recipes: RecipeChoice[];
  auto?: boolean;
  expandable?: boolean;
}) {
  const [recipeId, setRecipeId] = useState<number | "">("");
  const pdf = usePdfFetch();
  const [big, setBig] = useState(false);
  const first = useRef(true);
  const key = JSON.stringify({ config, format, recipeId });

  useEffect(() => {
    if (!auto && !first.current) return;
    const delay = first.current ? 0 : 400;
    first.current = false;
    const t = setTimeout(() => {
      void pdf.load("/api/pdf-preview", { config, format, recipeId: recipeId || null });
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <select
          className="fl-input"
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value ? Number(e.target.value) : "")}
          aria-label="Recette de l'aperçu"
          style={{ flex: 1, minWidth: 0 }}
        >
          <option value="">Recette récente (automatique)</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="fl-btn fl-btn-secondary fl-btn-icon"
          onClick={() => void pdf.load("/api/pdf-preview", { config, format, recipeId: recipeId || null })}
          aria-label="Régénérer l'aperçu"
          title="Régénérer l'aperçu"
        >
          <RefreshCw size={16} />
        </button>
        {expandable && (
          <button
            type="button"
            className="fl-btn fl-btn-secondary fl-btn-icon"
            onClick={() => setBig(true)}
            aria-label="Voir l'aperçu en grand"
            title="Voir l'aperçu en grand"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
      <div className="pdf-dialog-preview">
        <PdfPreview data={pdf.data} loading={pdf.loading} error={pdf.error} maxPages={3} />
      </div>
      {big && (
        <ModalOverlay full onClose={() => setBig(false)} title="Aperçu">
          <div className="pdf-dialog-preview" style={{ flex: 1 }}>
            <div style={{ maxWidth: 900, margin: "0 auto" }}>
              <PdfPreview data={pdf.data} loading={pdf.loading} error={pdf.error} maxPages={6} />
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
