"use client";

import { useEffect, useState, useTransition } from "react";
import {
  updateSnapshotMass,
  type UpdateSnapshotMassPayload,
} from "@/app/actions/cookbooks";
import { Icon } from "./Icon";

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";

type SnapInfo = {
  ingredients: { name: string; quantityG: number }[];
  totalMassG: number;
};

function formatG(g: number): string {
  if (g >= 1000) return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

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
  const [mode, setMode] = useState<Mode>("coefficient");
  const [coefficient, setCoefficient] = useState("1");
  const [targetMassG, setTargetMassG] = useState("");
  const [pivotIndex, setPivotIndex] = useState<number>(0);
  const [pivotTargetG, setPivotTargetG] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Charge les ingrédients du snapshot à l'ouverture
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/cookbooks/${cookbookId}/entries/${entryId}/snapshot`,
        );
        if (!res.ok) {
          if (!cancelled) setLoadError(`Erreur ${res.status}`);
          return;
        }
        const data = (await res.json()) as SnapInfo;
        if (cancelled) return;
        setSnap(data);
        setTargetMassG(String(Math.round(data.totalMassG)));
        if (data.ingredients[0]) {
          setPivotTargetG(String(Math.round(data.ingredients[0].quantityG)));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Erreur réseau");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cookbookId, entryId]);

  function buildPayload(): UpdateSnapshotMassPayload | null {
    if (mode === "coefficient") {
      const c = parseFloat(coefficient.replace(",", "."));
      if (!Number.isFinite(c) || c <= 0) {
        setError("Coefficient invalide.");
        return null;
      }
      return { mode: "coefficient", coefficient: c };
    }
    if (mode === "mass_target") {
      const m = parseFloat(targetMassG.replace(",", "."));
      if (!Number.isFinite(m) || m <= 0) {
        setError("Masse cible invalide.");
        return null;
      }
      return { mode: "mass_target", targetMassG: m };
    }
    const t = parseFloat(pivotTargetG.replace(",", "."));
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
      if (r.ok) {
        onClose();
      } else {
        setError(r.error);
      }
    });
  }

  // Ratio aperçu (pour montrer le résultat avant validation)
  let previewRatio: number | null = null;
  if (snap) {
    if (mode === "coefficient") {
      const c = parseFloat(coefficient.replace(",", "."));
      if (Number.isFinite(c) && c > 0) previewRatio = c;
    } else if (mode === "mass_target") {
      const m = parseFloat(targetMassG.replace(",", "."));
      if (Number.isFinite(m) && m > 0 && snap.totalMassG > 0) {
        previewRatio = m / snap.totalMassG;
      }
    } else if (snap.ingredients[pivotIndex]) {
      const t = parseFloat(pivotTargetG.replace(",", "."));
      const pivotQty = snap.ingredients[pivotIndex].quantityG;
      if (Number.isFinite(t) && t > 0 && pivotQty > 0) {
        previewRatio = t / pivotQty;
      }
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="fl-card"
        style={{
          width: "100%",
          maxWidth: 520,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className="fl-title-serif inline-flex items-center gap-2"
            style={{ fontSize: "1.1rem" }}
          >
            <Icon name="Scale" size={16} tone="accent" /> Modifier la masse
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="fl-label hover:text-[color:var(--text)] inline-flex items-center"
            style={{ fontSize: "0.8rem" }}
            aria-label="Fermer"
          >
            <Icon name="X" size={14} />
          </button>
        </div>

        <div className="text-sm text-[color:var(--muted)] inline-flex items-center gap-1">
          <strong style={{ color: "var(--text)" }}>{recipeName}</strong> · recette
          figée <Icon name="Pin" size={12} tone="pending" />
        </div>

        {loadError && (
          <div className="text-sm" style={{ color: "var(--danger)" }}>
            Erreur : {loadError}
          </div>
        )}

        {!snap && !loadError && (
          <div className="text-sm text-[color:var(--muted)]">Chargement…</div>
        )}

        {snap && (
          <>
            <div className="flex flex-col gap-1.5">
              <span className="fl-label">Mode</span>
              <div
                className="inline-flex rounded-md overflow-hidden border flex-wrap"
                style={{ borderColor: "var(--border)" }}
              >
                {[
                  { v: "coefficient", l: "Coefficient" },
                  { v: "mass_target", l: "Masse totale" },
                  { v: "pivot_ingredient", l: "Pivot" },
                ].map((o) => {
                  const sel = o.v === mode;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setMode(o.v as Mode)}
                      className="px-3 py-1.5 text-sm transition-colors"
                      style={{
                        background: sel ? "var(--accent)" : "transparent",
                        color: sel ? "var(--bg)" : "var(--text)",
                        fontWeight: sel ? 600 : 400,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      {o.l}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-xs text-[color:var(--muted)]">
              Masse totale actuelle :{" "}
              <strong style={{ color: "var(--text)" }}>
                {formatG(snap.totalMassG)}
              </strong>
            </div>

            {mode === "coefficient" && (
              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Coefficient (× tout)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={coefficient}
                  onChange={(e) => setCoefficient(e.target.value)}
                  className="fl-input"
                  autoFocus
                />
              </label>
            )}

            {mode === "mass_target" && (
              <label className="flex flex-col gap-1.5">
                <span className="fl-label">Masse totale cible (g)</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={targetMassG}
                  onChange={(e) => setTargetMassG(e.target.value)}
                  className="fl-input"
                  autoFocus
                />
              </label>
            )}

            {mode === "pivot_ingredient" && (
              <>
                <label className="flex flex-col gap-1.5">
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
                <label className="flex flex-col gap-1.5">
                  <span className="fl-label">
                    Quantité cible pour cet ingrédient (g)
                  </span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={pivotTargetG}
                    onChange={(e) => setPivotTargetG(e.target.value)}
                    className="fl-input"
                    autoFocus
                  />
                </label>
              </>
            )}

            {previewRatio !== null && (
              <div
                className="text-xs"
                style={{
                  color: "var(--muted)",
                  padding: "8px 10px",
                  background: "var(--surface)",
                  borderRadius: 6,
                  border: "1px dashed var(--border)",
                }}
              >
                Aperçu :{" "}
                <strong style={{ color: "var(--accent)" }}>
                  ×{previewRatio.toLocaleString("fr-FR", { maximumFractionDigits: 3 })}
                </strong>
                {" "} → masse totale ≈{" "}
                <strong style={{ color: "var(--text)" }}>
                  {formatG(snap.totalMassG * previewRatio)}
                </strong>
              </div>
            )}

            {error && (
              <div className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="fl-btn"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending}
                className="fl-btn fl-btn-primary"
              >
                {pending ? "Application…" : "Appliquer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
