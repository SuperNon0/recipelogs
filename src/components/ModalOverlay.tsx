"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useEscape } from "./ui/useMedia";
import { STOP } from "./ui/Menu";

/**
 * Fenêtre modale : centrée sur ordinateur, feuille qui remonte du bas sur
 * téléphone. Se ferme par la croix (ou Échap), jamais par un clic à côté.
 */
export function ModalOverlay({
  onClose,
  children,
  title,
  wide,
  full,
}: {
  onClose: () => void;
  children: React.ReactNode;
  /** Titre affiché avec un bouton de fermeture. */
  title?: React.ReactNode;
  /** Fenêtre large (aperçus, éditeurs). */
  wide?: boolean;
  /** Fenêtre qui occupe tout l'écran (aperçu en grand). */
  full?: boolean;
}) {
  useEscape(true, onClose);

  // Bloque le défilement de la page derrière la fenêtre.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    // Un clic à côté ne ferme pas : on perdait ce qu'on était en train de remplir.
    <div className="modal-veil" {...STOP}>
      <div
        role="dialog"
        aria-modal="true"
        className={`modal fl-scroll${wide ? " wide" : ""}${full ? " full" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grab" />
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            <button type="button" className="fl-btn fl-btn-ghost fl-btn-icon" onClick={onClose} aria-label="Fermer">
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
