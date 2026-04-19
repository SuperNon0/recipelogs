"use client";

import { useState, useTransition } from "react";
import { addRecipeToList, removeRecipeFromList } from "@/app/actions/shopping";

type LinkedRecipe = { recipeId: number; name: string; coefficient: number };
type AvailableRecipe = { id: number; name: string };

export function AddRecipeToListPanel({
  listId,
  linkedRecipes,
  availableRecipes,
}: {
  listId: number;
  linkedRecipes: LinkedRecipe[];
  availableRecipes: AvailableRecipe[];
}) {
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<number>(availableRecipes[0]?.id ?? 0);
  const [coef, setCoef] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const c = parseFloat(coef);
    if (!selectedId || isNaN(c) || c <= 0) {
      setError("Sélectionnez une recette et un coefficient valide.");
      return;
    }
    setError(null);
    void startTransition(async (): Promise<void> => {
      const result = await addRecipeToList(listId, selectedId, c);
      if (!result.ok) setError(result.error);
    });
  }

  function handleRemove(recipeId: number) {
    startTransition(() => { void removeRecipeFromList(listId, recipeId); });
  }

  return (
    <div className="fl-card flex flex-col gap-4">
      {/* Recettes déjà liées */}
      {linkedRecipes.length > 0 ? (
        <div className="flex flex-col gap-2">
          {linkedRecipes.map((r) => (
            <div key={r.recipeId} className="flex items-center justify-between gap-3">
              <span className="text-sm flex-1">{r.name}</span>
              <span className="fl-tag">×{r.coefficient}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(r.recipeId)}
                className="fl-label hover:text-[color:var(--danger)]"
                style={{ fontSize: "1rem", padding: "0 4px" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[color:var(--muted)]">
          Aucune recette liée. Ajoutez-en une pour générer les ingrédients automatiquement.
        </p>
      )}

      {/* Ajouter une recette */}
      {availableRecipes.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[color:var(--border)]">
          <p className="fl-label">Ajouter une recette</p>
          <div className="flex gap-2 flex-wrap">
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="fl-input flex-1"
              style={{ fontSize: "0.9rem" }}
            >
              {availableRecipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="fl-label">×</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={coef}
                onChange={(e) => setCoef(e.target.value)}
                className="fl-input"
                style={{ width: 80, fontSize: "0.9rem" }}
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={handleAdd}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.85rem" }}
            >
              {pending ? "…" : "Ajouter"}
            </button>
          </div>
          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
