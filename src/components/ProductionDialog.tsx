"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardList, FileDown, Plus } from "lucide-react";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { addToProduction, fetchRecipeYield } from "@/app/actions/production";

/**
 * Fenêtre « Fiche de production » d'une recette : quantité voulue (pièces si la
 * recette a un rendement, sinon multiplicateur), PDF direct ou ajout à la fiche
 * de production en cours (plusieurs recettes).
 */
export function ProductionDialog({ recipeId, recipeName, onClose }: { recipeId: number; recipeName: string; onClose: () => void }) {
  const [info, setInfo] = useState<Awaited<ReturnType<typeof fetchRecipeYield>> | null>(null);
  const [amount, setAmount] = useState("");
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [withSteps, setWithSteps] = useState(false);

  useEffect(() => {
    fetchRecipeYield(recipeId).then((r) => {
      setInfo(r);
      setAmount(String(r.inProduction ?? r.count ?? 1).replace(".", ","));
    });
  }, [recipeId]);

  const n = Number(amount.replace(",", "."));
  const okAmount = Number.isFinite(n) && n > 0;

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardList size={18} style={{ color: "var(--accent)" }} /> Fiche de production
          <Help title="Fiche de production">
            Toutes les pesées pour la quantité voulue, sous-recettes comprises, regroupées par
            préparation (dans l&apos;ordre où on les fait), avec le total par ingrédient à la fin. À
            imprimer et à garder au labo. Ajoute plusieurs recettes à la fiche de production pour
            tout sortir en une fois : les préparations communes sont additionnées.
          </Help>
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ color: "var(--soft)", margin: 0 }}>{recipeName}</p>
        {info === null ? (
          <p style={{ color: "var(--muted)" }}>Chargement…</p>
        ) : (
          <>
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="fl-label">{info.count ? "Combien en produire ?" : "Multiplicateur"}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!info.count && <span style={{ color: "var(--muted)" }}>×</span>}
                <input className="fl-input num" inputMode="decimal" value={amount} onChange={(e) => { setAmount(e.target.value); setAdded(false); }} style={{ width: 110, fontSize: 18 }} autoFocus />
                {info.count && <span style={{ color: "var(--soft)" }}>{info.label}</span>}
              </div>
              <small style={{ color: "var(--muted)", fontSize: 12.5 }}>
                {info.count
                  ? `La recette donne ${info.count} ${info.label} : ${okAmount ? `×${(n / info.count).toLocaleString("fr-FR", { maximumFractionDigits: 3 })}` : "…"}`
                  : "Pas de rendement sur cette recette : indique un multiplicateur (ou renseigne le rendement dans « Modifier » pour compter en pièces)."}
              </small>
            </label>
            {error && <p style={{ color: "var(--danger)", fontSize: 13, margin: 0 }}>{error}</p>}
            {added && (
              <p style={{ color: "var(--accent-2)", fontSize: 13.5, margin: 0 }}>
                Ajoutée à la fiche de production. <Link href="/production" style={{ color: "var(--accent)" }} onClick={onClose}>Voir la fiche</Link>
              </p>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--soft)" }}>
              <input type="checkbox" checked={withSteps} onChange={(e) => setWithSteps(e.target.checked)} /> Imprimer aussi les étapes
            </label>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button
                type="button"
                className="fl-btn fl-btn-secondary"
                disabled={!okAmount || busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  const r = await addToProduction(recipeId, n);
                  setBusy(false);
                  if (r.ok) setAdded(true);
                  else setError(r.error);
                }}
              >
                <Plus size={15} /> {info.inProduction ? "Mettre à jour la fiche" : "Ajouter à la fiche"}
              </button>
              <a className="fl-btn fl-btn-primary" href={okAmount ? `/recipes/${recipeId}/production?n=${n}${withSteps ? "&etapes=1" : ""}` : undefined} aria-disabled={!okAmount} download>
                <FileDown size={15} /> PDF de cette recette
              </a>
            </div>
          </>
        )}
      </div>
    </ModalOverlay>
  );
}
