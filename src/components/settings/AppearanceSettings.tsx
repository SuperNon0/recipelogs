"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Help } from "@/components/ui/Help";

type EncreWindow = Window & { Encre?: { apparence?: { marquer?: () => void } } };

const ACCENTS: { v: string; label: string }[] = [
  { v: "ambre", label: "Ambre" },
  { v: "or", label: "Or" },
  { v: "corail", label: "Corail" },
  { v: "menthe", label: "Menthe" },
  { v: "lavande", label: "Lavande" },
];

/**
 * Réglages → Apparence (design « encre ») : thème et couleur d'accent.
 * Les boutons sont branchés tout seuls par encre.js (data-encre-theme,
 * data-encre-accent) : le choix est gardé sur cet appareil.
 */
export function AppearanceSettings() {
  // La page peut s'afficher après le démarrage d'encre.js : on rallume le bon choix.
  useEffect(() => {
    const allume = () => (window as EncreWindow).Encre?.apparence?.marquer?.();
    allume();
    const t = window.setTimeout(allume, 300);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="fl-card encre-apparence" id="apparence">
      <div className="set-l">
        <b className="set-l-t">
          Thème
          <Help title="Thème">
            Automatique suit le réglage de l&apos;appareil (clair le jour, sombre le soir si l&apos;appareil le fait).
            Clair ou Sombre l&apos;impose. Le choix est gardé sur cet appareil seulement : chaque téléphone ou
            ordinateur a le sien.
          </Help>
        </b>
        <div className="seg" data-encre-theme="" role="group" aria-label="Thème">
          <button type="button" data-v="auto">
            <Monitor size={16} />
            Automatique
          </button>
          <button type="button" data-v="clair">
            <Sun size={16} />
            Clair
          </button>
          <button type="button" data-v="sombre">
            <Moon size={16} />
            Sombre
          </button>
        </div>
      </div>
      <div className="set-l">
        <b className="set-l-t">
          Couleur d&apos;accent
          <Help title="Couleur d'accent">
            La couleur des boutons principaux, de l&apos;onglet ouvert et des liens. Ambre est la couleur de
            RecipeLog. Elle n&apos;a aucun effet sur les PDF (leurs couleurs se règlent dans Thèmes PDF). Gardée sur
            cet appareil seulement.
          </Help>
        </b>
        <div className="pastilles" data-encre-accent="" role="radiogroup" aria-label="Couleur d'accent">
          {ACCENTS.map((a) => (
            <button key={a.v} type="button" className="past" data-v={a.v} role="radio" aria-checked="false">
              <i />
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
