"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Download, FileDown, Palette, Star } from "lucide-react";
import { ModalOverlay } from "./ModalOverlay";
import { PdfPreview, usePdfFetch } from "./PdfPreview";
import { ThemeThumb } from "./ThemeThumb";
import { RECIPE_LAYOUT_LABELS, FONT_LABELS, type CookbookTheme } from "@/lib/pdf/theme";
import { useIsPhone } from "./ui/useMedia";

export type PdfThemeOption = {
  id: number;
  name: string;
  description: string | null;
  format: "A4" | "A5";
  isDefault: boolean;
  config: CookbookTheme;
};

/**
 * Fenêtre « Télécharger le PDF » : liste des thèmes à gauche, aperçu de la
 * recette avec le thème choisi à droite, puis téléchargement.
 * Sur téléphone : la liste, puis l'aperçu en plein écran avec un bouton retour.
 */
export function RecipePdfDialog({
  recipeId,
  recipeName,
  themes,
  onClose,
}: {
  recipeId: number;
  recipeName: string;
  themes: PdfThemeOption[];
  onClose: () => void;
}) {
  const phone = useIsPhone();
  const initial = themes.find((t) => t.isDefault) ?? themes[0];
  const [selected, setSelected] = useState<number | null>(phone ? null : initial?.id ?? null);
  const pdf = usePdfFetch();
  const picked = useRef(false);
  const pick = (id: number | null) => {
    picked.current = true;
    setSelected(id);
  };

  // Ordinateur : thème par défaut présélectionné. Téléphone : on commence par la liste.
  useEffect(() => {
    if (picked.current) return;
    setSelected(phone ? null : initial?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  useEffect(() => {
    if (selected == null) return;
    void pdf.load(`/recipes/${recipeId}/pdf?theme=${selected}&inline=1`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, recipeId]);

  const current = themes.find((t) => t.id === selected) ?? null;
  const downloadHref = current ? `/recipes/${recipeId}/pdf?theme=${current.id}` : "#";
  const showList = !phone || selected == null;
  const showPreview = !phone || selected != null;

  return (
    <ModalOverlay
      wide
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {phone && selected != null ? (
            <button type="button" onClick={() => pick(null)} aria-label="Retour aux thèmes" style={{ background: "none", border: "none", color: "var(--accent)", display: "grid", padding: 0 }}>
              <ArrowLeft size={20} />
            </button>
          ) : (
            <FileDown size={18} style={{ color: "var(--accent)" }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {phone && current ? current.name : "Télécharger le PDF"}
          </span>
        </span>
      }
    >
      <div className="pdf-dialog">
        {showList && (
          <div className="pdf-dialog-list fl-scroll">
            <p style={{ color: "var(--muted)", fontSize: 12.5, margin: "0 4px 10px" }}>
              {themes.length} thème{themes.length > 1 ? "s" : ""} · choisis-en un pour voir « {recipeName} »
            </p>
            {themes.map((t) => {
              const on = t.id === selected;
              return (
                <button
                  key={t.id}
                  type="button"
                  className="pdf-theme-opt"
                  aria-pressed={on}
                  onClick={() => pick(t.id)}
                >
                  <ThemeThumb config={t.config} width={38} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>{t.name}</b>
                    <small>
                      {t.isDefault && <><Star size={11} fill="currentColor" style={{ color: "var(--accent)", verticalAlign: -1 }} aria-hidden /> Par défaut · </>}
                      {RECIPE_LAYOUT_LABELS[t.config.recipeLayout]} · {FONT_LABELS[t.config.titleFont] ?? t.config.titleFont} · {t.format}
                    </small>
                  </span>
                  {on && <Check size={16} style={{ color: "var(--accent)", flex: "none" }} />}
                </button>
              );
            })}
            <Link href="/settings/themes" className="fl-btn fl-btn-ghost" style={{ marginTop: 8, width: "100%", justifyContent: "flex-start" }} onClick={onClose}>
              <Palette size={16} />
              Gérer et créer des thèmes
            </Link>
          </div>
        )}
        {showPreview && (
          <div className="pdf-dialog-preview fl-scroll">
            <PdfPreview data={pdf.data} loading={pdf.loading} error={pdf.error} />
          </div>
        )}
      </div>
      {showPreview && (
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
          {current && (
            <span style={{ marginRight: "auto", color: "var(--muted)", fontSize: 12.5 }}>
              Thème : <b style={{ color: "var(--soft)", fontWeight: 500 }}>{current.name}</b> · {current.format}
            </span>
          )}
          <button type="button" className="fl-btn fl-btn-secondary desk-only" onClick={onClose}>
            Fermer
          </button>
          <a
            href={downloadHref}
            className="fl-btn fl-btn-primary"
            aria-disabled={!current}
            style={{ pointerEvents: current ? undefined : "none", opacity: current ? 1 : 0.5, flex: phone ? 1 : undefined, height: phone ? 46 : undefined }}
          >
            <Download size={16} />
            Télécharger
          </a>
        </div>
      )}
    </ModalOverlay>
  );
}
