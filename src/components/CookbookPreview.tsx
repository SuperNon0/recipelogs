"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { PdfPreview, usePdfFetch } from "./PdfPreview";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { type CookbookTheme } from "@/lib/pdf/theme";

export type CookbookPreviewPayload = {
  name: string;
  description: string;
  theme: CookbookTheme;
  hasCover: boolean;
  hasToc: boolean;
  format: string;
  footer: string;
};

/**
 * Aperçu fidèle du cahier (le vrai PDF, affiché avec pdf.js).
 *
 * La génération ne se lance qu'au clic sur « Mettre à jour l'aperçu » : un
 * cahier complet est long à produire. On envoie les réglages en cours (pas
 * besoin d'enregistrer avant). L'état est gardé par le formulaire pour que
 * l'aperçu survive à l'ouverture / fermeture de la fenêtre sur téléphone.
 */
export function useCookbookPreview(cookbookId: number, payload: CookbookPreviewPayload) {
  const pdf = usePdfFetch();
  const key = JSON.stringify(payload);
  const [lastKey, setLastKey] = useState<string | null>(null);

  const generate = () => {
    setLastKey(key);
    return pdf.load(`/api/cookbooks/${cookbookId}/preview-pdf`, payload);
  };

  return {
    ...pdf,
    generate,
    /** Les réglages ont changé depuis la dernière génération. */
    stale: lastKey !== null && lastKey !== key,
    generated: lastKey !== null,
  };
}

export type CookbookPreviewState = ReturnType<typeof useCookbookPreview>;

export function CookbookPreview({ state, inModal }: { state: CookbookPreviewState; inModal?: boolean }) {
  const [big, setBig] = useState(false);
  const { data, loading, error, generate, stale, generated } = state;

  // Première ouverture dans la fenêtre téléphone : génère tout de suite.
  const autoRef = useRef(false);
  useEffect(() => {
    if (inModal && !generated && !autoRef.current) {
      autoRef.current = true;
      generate();
    }
  }, [inModal, generated, generate]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {!inModal && (
          <span className="fl-label" style={{ display: "flex", alignItems: "center", marginRight: "auto" }}>
            Aperçu du PDF
            <Help title="Aperçu du PDF">
              Le vrai PDF du cahier, généré avec les réglages affichés (même avant
              d&apos;enregistrer). Comme un cahier complet prend quelques secondes à produire,
              l&apos;aperçu ne se met à jour que quand tu cliques sur le bouton. Les premières pages
              seulement sont affichées.
            </Help>
          </span>
        )}
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className={`fl-btn ${!generated || stale ? "fl-btn-primary" : "fl-btn-secondary"}`}
          style={inModal ? { flex: 1, justifyContent: "center" } : undefined}
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : undefined} />
          {loading ? "Génération…" : generated ? "Mettre à jour l'aperçu" : "Générer l'aperçu"}
        </button>
        {!inModal && data && (
          <button type="button" className="fl-btn fl-btn-secondary fl-btn-icon" onClick={() => setBig(true)} aria-label="Agrandir l'aperçu" title="Agrandir">
            <Maximize2 size={16} />
          </button>
        )}
      </div>
      {stale && !loading && (
        <p style={{ color: "var(--accent)", fontSize: 12.5 }}>Réglages modifiés depuis l&apos;aperçu : mets-le à jour.</p>
      )}

      <div className="cb-preview-box">
        {data || loading || error ? (
          <PdfPreview data={data} loading={loading} error={error} maxPages={8} />
        ) : (
          <div className="cb-preview-empty">
            Clique sur « Générer l&apos;aperçu » pour voir le PDF du cahier tel qu&apos;il sera
            téléchargé.
          </div>
        )}
      </div>

      {big && data && (
        <ModalOverlay wide title="Aperçu du cahier" onClose={() => setBig(false)}>
          <div className="cb-preview-box" style={{ maxWidth: 760, width: "100%", margin: "0 auto" }}>
            <PdfPreview data={data} loading={loading} error={error} maxPages={20} />
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
