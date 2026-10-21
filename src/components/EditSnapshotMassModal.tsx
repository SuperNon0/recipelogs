"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, Scale } from "lucide-react";
import { updateSnapshotMass, type UpdateSnapshotMassPayload } from "@/app/actions/cookbooks";
import { formatG } from "@/lib/format";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";

type SnapInfo = {
  ingredients: { name: string; quantityG: number }[];
  totalMassG: number;
};

const num = (s: string) => parseFloat(s.replace(",", "."));

/** Change la masse d'une recette figée (copie) dans un cahier. */
export function EditSnapshotMassModal({
  cookbookId,
  entryId,
  recipeName,
  onClose,
}: {
  cookbookId: number;
  entryId: number;
  recipeName: string;
  onClose: () => void;
}) {
  const [snap, setSnap] = useState<SnapInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("mass_target");
  const [coefficient, setCoefficient] = useState("1");
  const [targetMassG, setTargetMassG] = useState("");
  const [pivotIndex, setPivotIndex] = useState<number>(0);
  const [pivotTargetG, setPivotTargetG] = useState("");
  const [forceExact, setForceExact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Charge les ingrédients de la copie figée à l'ouverture.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/cookbooks/${cookbookId}/entries/${entryId}/snapshot`);
        if (!res.ok) {
          if (!cancelled) setLoadError("Impossible de charger la recette figée.");
          return;
        }
        const data = (await res.json()) as SnapInfo;
        if (cancelled) return;
        setSnap(data);
        setTargetMassG(String(Math.round(data.totalMassG)));
        if (data.ingredients[0]) setPivotTargetG(String(Math.round(data.ingredients[0].quantityG)));
      } catch {
        if (!cancelled) setLoadError("Erreur réseau. Réessaie dans un instant.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cookbookId, entryId]);

  function buildPayload(): UpdateSnapshotMassPayload | null {
    if (mode === "coefficient") {
      const c = num(coefficient);
      if (!Number.isFinite(c) || c <= 0) {
        setError("Coefficient invalide.");
        return null;
      }
      return { mode: "coefficient", coefficient: c };
    }
    if (mode === "mass_target") {
      const m = num(targetMassG);
      if (!Number.isFinite(m) || m <= 0) {
        setError("Masse cible invalide.");
        return null;
      }
      return { mode: "mass_target", targetMassG: m, forceExact };
    }
    const t = num(pivotTargetG);
    if (!Number.isFinite(t) || t <= 0) {
      setError("Quantité cible invalide.");
      return null;
    }
    return { mode: "pivot_ingredient", pivotIndex, targetMassG: t };
  }

  function handleSubmit() {
    setError(null);
    const payload = buildPayload();
    if (!payload) return;
    startTransition(async () => {
      const r = await updateSnapshotMass(entryId, payload, cookbookId);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  // Coefficient obtenu (affiché avant validation).
  let ratio: number | null = null;
  if (snap) {
    if (mode === "coefficient") {
      const c = num(coefficient);
      if (Number.isFinite(c) && c > 0) ratio = c;
    } else if (mode === "mass_target") {
      const m = num(targetMassG);
      if (Number.isFinite(m) && m > 0 && snap.totalMassG > 0) ratio = m / snap.totalMassG;
    } else if (snap.ingredients[pivotIndex]) {
      const t = num(pivotTargetG);
      const q = snap.ingredients[pivotIndex].quantityG;
      if (Number.isFinite(t) && t > 0 && q > 0) ratio = t / q;
    }
  }

  const title = (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Scale size={18} style={{ color: "var(--accent)" }} /> Masse de la recette figée
    </span>
  );

  return (
    <ModalOverlay onClose={onClose} title={title}>
      <p style={{ color: "var(--muted)", marginTop: -6, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Pin size={14} style={{ color: "var(--lock)" }} />
        <span style={{ color: "var(--text)" }}>{recipeName}</span>
        <Help title="Masse figée">
          Cette recette est figée dans le cahier : c&apos;est une copie. Changer sa masse multiplie
          toutes les quantités de la copie, sans toucher à la recette d&apos;origine.
        </Help>
      </p>

      {loadError && <p style={{ color: "var(--danger)", fontSize: 13 }}>{loadError}</p>}
      {!snap && !loadError && <p style={{ color: "var(--muted)" }}>Chargement…</p>}

      {snap && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <div className="fl-seg">
              <button type="button" aria-pressed={mode === "mass_target"} onClick={() => setMode("mass_target")}>
                Masse totale
              </button>
              <button type="button" aria-pressed={mode === "coefficient"} onClick={() => setMode("coefficient")}>
                Coefficient
              </button>
              <button
                type="button"
                aria-pressed={mode === "pivot_ingredient"}
                onClick={() => setMode("pivot_ingredient")}
                disabled={snap.ingredients.length === 0}
              >
                Pivot
              </button>
            </div>
            <Help
              title="Trois façons de changer la masse"
              calc={"Masse totale : coef = masse voulue ÷ masse actuelle\nCoefficient : coef saisi\nPivot : coef = quantité voulue ÷ quantité actuelle de l'ingrédient\nChaque quantité = quantité actuelle × coef"}
              example="Recette de 800 g, masse voulue 1 200 g : coef 1,5 ; 200 g de beurre deviennent 300 g."
            >
              Choisis la masse totale voulue, un coefficient direct, ou la quantité d&apos;un ingrédient
              (le pivot) : toutes les autres quantités suivent la même proportion.
            </Help>
          </div>

          <p style={{ color: "var(--muted)", fontSize: 12.5 }}>
            Masse actuelle : <span className="num" style={{ color: "var(--text)" }}>{formatG(snap.totalMassG)}</span>
          </p>

          {mode === "coefficient" && (
            <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <span className="fl-label">Coefficient (multiplie tout)</span>
              <input type="number" step="0.01" min="0.01" inputMode="decimal" value={coefficient} onChange={(e) => setCoefficient(e.target.value)} className="fl-input" autoFocus />
            </label>
          )}

          {mode === "mass_target" && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="fl-label">Masse totale voulue (g)</span>
                <input type="number" step="1" min="1" inputMode="numeric" value={targetMassG} onChange={(e) => setTargetMassG(e.target.value)} className="fl-input" autoFocus />
              </label>
              <ExactToggle checked={forceExact} onChange={setForceExact} />
            </>
          )}

          {mode === "pivot_ingredient" && (
            <>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="fl-label">Ingrédient pivot</span>
                <select
                  value={pivotIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setPivotIndex(idx);
                    const ing = snap.ingredients[idx];
                    if (ing) setPivotTargetG(String(Math.round(ing.quantityG)));
                  }}
                  className="fl-input"
                >
                  {snap.ingredients.map((i, idx) => (
                    <option key={idx} value={idx}>
                      {i.name} ({formatG(i.quantityG)})
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <span className="fl-label">Quantité voulue pour cet ingrédient (g)</span>
                <input type="number" step="1" min="1" inputMode="numeric" value={pivotTargetG} onChange={(e) => setPivotTargetG(e.target.value)} className="fl-input" autoFocus />
              </label>
            </>
          )}

          {ratio !== null && (
            <div className="fl-card" style={{ padding: "10px 12px", background: "var(--bg)", fontSize: 13, color: "var(--soft)" }}>
              Résultat : coefficient{" "}
              <span className="num" style={{ color: "var(--accent)" }}>
                × {ratio.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
              </span>
              , masse totale d&apos;environ{" "}
              <span className="num" style={{ color: "var(--text)" }}>{formatG(snap.totalMassG * ratio)}</span>
            </div>
          )}

          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={pending} className="fl-btn fl-btn-secondary">
              Annuler
            </button>
            <button type="button" onClick={handleSubmit} disabled={pending} className="fl-btn fl-btn-primary">
              {pending ? "Application…" : "Appliquer"}
            </button>
          </div>
        </>
      )}
    </ModalOverlay>
  );
}

/** Interrupteur « masse exacte » (partagé avec l'ajout de recettes). */
export function ExactToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 13.5, color: "var(--soft)", display: "flex", alignItems: "center" }}>
        Masse exacte
        <Help
          title="Masse exacte"
          calc="quantités arrondies au gramme, puis ± 1 g sur les plus gros ingrédients jusqu'à tomber juste"
          example="Cible 1 000 g : sans cette option on peut obtenir 1 002 g ; avec, exactement 1 000 g."
        >
          Les quantités sont arrondies au gramme, ce qui peut donner quelques grammes de plus que la
          masse voulue. Active cette option pour corriger l&apos;écart sur les plus gros ingrédients.
        </Help>
      </span>
      <button type="button" role="switch" aria-checked={checked} aria-label="Masse exacte" className="fl-switch" onClick={() => onChange(!checked)} />
    </div>
  );
}
