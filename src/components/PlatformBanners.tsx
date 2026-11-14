"use client";

import { useEffect, useState } from "react";
import { Info, TriangleAlert, Wrench, X } from "lucide-react";
import type { Bandeau } from "@/lib/auth/passerelle";

const CLE = "rl-bandeaux-fermes";
const jour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
// « le samedi 14 novembre de 22:00 à 23:00 », ou sur deux jours « du … au … ».
function plage(debut: string, fin: string | null) {
  if (!fin) return `le ${jour(debut)} à ${heure(debut)}`;
  if (jour(debut) === jour(fin)) return `le ${jour(debut)} de ${heure(debut)} à ${heure(fin)}`;
  return `du ${jour(debut)} à ${heure(debut)} au ${jour(fin)} à ${heure(fin)}`;
}

/** Bandeaux envoyés par l'équipe RecipeLog (maintenance prévue, informations). Fermables, retenus sur cet appareil. */
export function PlatformBanners({ bandeaux, maintenanceEnCours }: { bandeaux: Bandeau[]; maintenanceEnCours?: string | null }) {
  const [fermes, setFermes] = useState<string[] | null>(null);
  useEffect(() => {
    try {
      setFermes(JSON.parse(localStorage.getItem(CLE) || "[]"));
    } catch {
      setFermes([]);
    }
  }, []);
  const fermer = (id: string) => {
    const n = [...(fermes ?? []), id].slice(-50);
    setFermes(n);
    try {
      localStorage.setItem(CLE, JSON.stringify(n));
    } catch {
      /* navigation privée : fermé jusqu'au rechargement */
    }
  };
  const visibles = fermes === null ? [] : bandeaux.filter((b) => !fermes.includes(b.id));
  if (!visibles.length && !maintenanceEnCours) return null;
  return (
    <>
      {maintenanceEnCours && (
        <div className="pf-banner pf-alerte" role="status">
          <Wrench size={16} />
          <span>
            <b>Maintenance en cours</b> : ton équipe voit la page d&apos;attente ; seule l&apos;équipe RecipeLog peut entrer.
          </span>
        </div>
      )}
      {visibles.map((b) => (
        <div key={b.id} className={`pf-banner pf-${b.niveau}`} role="status">
          {b.maintenance ? <Wrench size={16} /> : b.niveau === "alerte" ? <TriangleAlert size={16} /> : <Info size={16} />}
          <span>
            {b.maintenance ? (
              <>
                <b>Maintenance prévue {plage(b.maintenance.debut, b.maintenance.fin)}</b>
                {b.texte ? ` : ${b.texte}` : ""}
              </>
            ) : (
              b.texte
            )}
          </span>
          <button type="button" className="pf-close" aria-label="Fermer ce bandeau" onClick={() => fermer(b.id)}>
            <X size={15} />
          </button>
        </div>
      ))}
    </>
  );
}
