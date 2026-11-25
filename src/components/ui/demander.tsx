"use client";

import { createRoot } from "react-dom/client";
import { AlertTriangle, Info } from "lucide-react";
import { ModalOverlay } from "../ModalOverlay";

/**
 * Remplace les petites boîtes grises du navigateur (confirm, alert) par une vraie
 * fenêtre RecipeLog, comme pour les fournisseurs et les commandes. Elle ne se ferme
 * que par sa croix ou ses boutons (règle de Noë).
 *
 *   if (!(await demander("Supprimer cette note ?"))) return;
 *   prevenir(res.error);
 *
 * Fermer par la croix = « Annuler ».
 */
type Options = {
  /** Titre de la fenêtre (par défaut « Es-tu sûr ? »). */
  titre?: string;
  /** Texte du bouton qui confirme (par défaut « Confirmer »). */
  ok?: string;
  /** Bouton rouge : suppression, action qu'on ne peut pas défaire. */
  danger?: boolean;
};

function monter(rendu: (fermer: () => void) => React.ReactNode) {
  const hote = document.createElement("div");
  document.body.appendChild(hote);
  const racine = createRoot(hote);
  const fermer = () => {
    racine.unmount();
    hote.remove();
  };
  racine.render(rendu(fermer));
}

// Un texte peut avoir des paragraphes (séparés par une ligne vide), comme avant.
const Texte = ({ texte }: { texte: string }) => (
  <>
    {texte
      .split(/\n{2,}/)
      .map((p, i) => (
        <p key={i} style={{ margin: 0, whiteSpace: "pre-line" }}>
          {p}
        </p>
      ))}
  </>
);

/** Fenêtre « Es-tu sûr ? » : rend true si on confirme, false si on annule ou ferme. */
export function demander(texte: string, options: Options = {}): Promise<boolean> {
  const danger = options.danger ?? /supprim|retirer|irréversible|vider|couper|déconnect|perdu/i.test(texte);
  return new Promise((repondre) => {
    monter((fermer) => {
      const fin = (oui: boolean) => {
        fermer();
        repondre(oui);
      };
      return (
        <ModalOverlay onClose={() => fin(false)} title={options.titre ?? "Es-tu sûr ?"}>
          <div style={{ display: "grid", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              {danger && <AlertTriangle size={18} style={{ color: "var(--danger, #c0392b)", flex: "none", marginTop: 2 }} />}
              <div style={{ display: "grid", gap: 8 }}>
                <Texte texte={texte} />
              </div>
            </div>
            <button type="button" className={`fl-btn ${danger ? "fl-btn-danger" : "fl-btn-primary"}`} onClick={() => fin(true)} autoFocus>
              {options.ok ?? (danger ? "Oui, continuer" : "Confirmer")}
            </button>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={() => fin(false)}>
              Annuler
            </button>
          </div>
        </ModalOverlay>
      );
    });
  });
}

/** Message simple (une erreur, par exemple) avec un bouton « OK ». */
export function prevenir(texte: string, titre = "Attention"): Promise<void> {
  return new Promise((fini) => {
    monter((fermer) => {
      const fin = () => {
        fermer();
        fini();
      };
      return (
        <ModalOverlay onClose={fin} title={titre}>
          <div style={{ display: "grid", gap: 12, fontSize: 14, lineHeight: 1.5 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <Info size={18} style={{ color: "var(--accent)", flex: "none", marginTop: 2 }} />
              <div style={{ display: "grid", gap: 8 }}>
                <Texte texte={texte} />
              </div>
            </div>
            <button type="button" className="fl-btn fl-btn-primary" onClick={fin} autoFocus>
              OK
            </button>
          </div>
        </ModalOverlay>
      );
    });
  });
}
