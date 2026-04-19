"use client";

import { useState } from "react";
import { ModalOverlay } from "./RecipeBody";
import { addSubRecipe } from "@/app/actions/subRecipes";

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";

export function AddSubRecipeButton({
  parentId,
  availableRecipes,
}: {
  parentId: number;
  availableRecipes: { id: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-btn fl-btn-edit"
      >
        + Ajouter une sous-recette
      </button>
      {open && (
        <AddSubRecipeModal
          parentId={parentId}
          availableRecipes={availableRecipes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddSubRecipeModal({
  parentId,
  availableRecipes,
  onClose,
}: {
  parentId: number;
  availableRecipes: { id: number; name: string }[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [childId, setChildId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [calcMode, setCalcMode] = useState<Mode>("mass_target");
  const [calcValue, setCalcValue] = useState("500");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const filtered = availableRecipes.filter((r) =>
    r.name.toLowerCase().includes(query.toLowerCase()),
  );

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!childId) {
      setError("Choisissez une recette source.");
      return;
    }
    if (!label.trim()) {
      setError("Indiquez un label (ex: Mousse, Biscuit, Glaçage).");
      return;
    }
    const fd = new FormData();
    fd.set("childId", String(childId));
    fd.set("label", label.trim());
    fd.set("calcMode", calcMode);
    fd.set("calcValue", calcValue);
    setSubmitting(true);
    const res = await addSubRecipe(parentId, fd);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>
          Ajouter une sous-recette
        </h3>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Recette source</span>
          <input
            className="fl-input"
            placeholder="Rechercher…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="fl-scroll"
            style={{
              maxHeight: 240,
              overflowY: "auto",
              border: "1px solid var(--border)",
              borderRadius: 8,
              background: "var(--bg)",
            }}
          >
            {filtered.length === 0 ? (
              <div className="p-3 text-[color:var(--muted)] text-sm">
                Aucune recette disponible.
              </div>
            ) : (
              filtered.map((r) => {
                const active = childId === r.id;
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => {
                      setChildId(r.id);
                      if (!label) setLabel(r.name);
                    }}
                    className="w-full text-left px-3 py-2"
                    style={{
                      background: active
                        ? "rgba(232, 197, 71, 0.12)"
                        : "transparent",
                      color: active ? "var(--accent)" : "var(--text)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {r.name}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Label (ex: Mousse, Biscuit…)</span>
          <input
            className="fl-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Mode de calcul</span>
          <select
            className="fl-input"
            value={calcMode}
            onChange={(e) => setCalcMode(e.target.value as Mode)}
          >
            <option value="coefficient">Coefficient (×)</option>
            <option value="mass_target">Masse totale cible (g)</option>
            <option value="pivot_ingredient">
              Ingrédient pivot (g) — à ajuster ensuite
            </option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Valeur initiale</span>
          <input
            type="number"
            step="0.01"
            min="0"
            className="fl-input"
            value={calcValue}
            onChange={(e) => setCalcValue(e.target.value)}
            required
          />
        </div>

        {error && (
          <div
            className="fl-card"
            style={{
              background: "rgba(232, 92, 71, 0.08)",
              borderColor: "rgba(232, 92, 71, 0.4)",
              color: "var(--danger)",
              padding: "0.6rem 0.8rem",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="fl-btn fl-btn-primary"
          >
            {submitting ? "…" : "Ajouter"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="fl-btn fl-btn-secondary"
          >
            Annuler
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
