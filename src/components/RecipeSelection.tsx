"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { deleteRecipes } from "@/app/actions/recipes";

/**
 * Sélection multiple de recettes + suppression en lot.
 *
 * Le contexte est posé tout en haut de la page d'accueil (et des favoris),
 * si bien que TOUTES les RecipeCard — quelle que soit la vue (explorateur,
 * dossier ouvert, « tout afficher » groupé par dossier, résultats de
 * recherche) — partagent le même état de sélection.
 *
 * - Hors mode sélection : la carte se comporte normalement (lien vers la fiche).
 * - En mode sélection : un clic sur la carte coche / décoche la recette,
 *   et une barre flottante en bas propose « Supprimer N recette(s) ».
 */

type SelectionCtx = {
  selectionMode: boolean;
  enterSelection: () => void;
  exitSelection: () => void;
  toggle: (id: number) => void;
  isSelected: (id: number) => boolean;
  count: number;
};

const Ctx = createContext<SelectionCtx | null>(null);

export function useRecipeSelection(): SelectionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Hors provider (ex. page partagée) : sélection désactivée, no-op.
    return {
      selectionMode: false,
      enterSelection: () => {},
      exitSelection: () => {},
      toggle: () => {},
      isSelected: () => false,
      count: 0,
    };
  }
  return ctx;
}

export function RecipeSelectionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set<number>());
  const [error, setError] = useState<string | null>(null);

  const enterSelection = useCallback(() => {
    setSelectionMode(true);
    setError(null);
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelected(new Set<number>());
    setError(null);
  }, []);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback((id: number) => selected.has(id), [selected]);

  function handleDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const ok = confirm(
      `Supprimer ${ids.length} recette${ids.length > 1 ? "s" : ""} ?\n\nCette action est irréversible.`,
    );
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteRecipes(ids);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSelectionMode(false);
      setSelected(new Set<number>());
      router.refresh();
    });
  }

  const value = useMemo<SelectionCtx>(
    () => ({
      selectionMode,
      enterSelection,
      exitSelection,
      toggle,
      isSelected,
      count: selected.size,
    }),
    [selectionMode, enterSelection, exitSelection, toggle, isSelected, selected.size],
  );

  return (
    <Ctx.Provider value={value}>
      {children}

      {/* Barre d'action flottante (mode sélection) */}
      {selectionMode && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
            zIndex: 90,
            width: "calc(100% - 2rem)",
            maxWidth: 480,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            padding: "0.75rem 0.9rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {error && (
            <p style={{ fontSize: "0.78rem", color: "var(--danger)", margin: 0 }}>
              {error}
            </p>
          )}
          <div className="flex items-center gap-2">
            <span
              style={{
                flex: 1,
                fontSize: "0.85rem",
                fontFamily: "var(--font-mono)",
                color: "var(--text)",
              }}
            >
              {selected.size} recette{selected.size > 1 ? "s" : ""} sélectionnée
              {selected.size > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={exitSelection}
              disabled={pending}
              className="fl-btn"
              style={{ fontSize: "0.8rem" }}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending || selected.size === 0}
              className="fl-btn"
              style={{
                fontSize: "0.8rem",
                background: selected.size > 0 ? "var(--danger)" : "transparent",
                color: selected.size > 0 ? "#fff" : "var(--muted)",
                borderColor: "var(--danger)",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Suppression…" : `🗑 Supprimer`}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/**
 * Bouton d'en-tête pour entrer / sortir du mode sélection.
 * À placer dans la barre d'actions de la page.
 */
export function RecipeSelectionToggle() {
  const { selectionMode, enterSelection, exitSelection } = useRecipeSelection();
  return (
    <button
      type="button"
      onClick={selectionMode ? exitSelection : enterSelection}
      className="fl-btn fl-btn-secondary"
      style={{ fontSize: "0.8rem" }}
      title="Sélectionner plusieurs recettes pour les supprimer"
    >
      {selectionMode ? "✕ Annuler" : "☑ Sélectionner"}
    </button>
  );
}
