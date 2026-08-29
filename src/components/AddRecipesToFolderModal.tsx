"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { assignRecipesToFolder } from "@/app/actions/settings";
import { Icon } from "./Icon";

type RecipeOption = {
  id: number;
  name: string;
  folderId: number | null;
  folder: { name: string; color: string } | null;
};

const DEBOUNCE_MS = 200;

/**
 * Modal réutilisable « Ajouter des recettes au dossier ».
 *
 * Utilisée :
 *  - depuis /settings via le bouton « + Ajouter » de chaque dossier
 *  - depuis la vue d'un dossier via le bouton « + Ranger des recettes ici »
 *
 * Comportement :
 *  - Toggle « Que les recettes sans dossier » activé par défaut (95% des cas)
 *  - Autocomplétion qui filtre via l'API à la frappe (debounced 200ms)
 *  - Multi-sélection avec chips × en haut
 *  - Bouton primaire « Ranger les N recette(s) → 📁 [nom] »
 */
export function AddRecipesToFolderModal({
  folder,
  onClose,
}: {
  folder: { id: number; name: string; color: string };
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [onlyNoFolder, setOnlyNoFolder] = useState(true);
  const [options, setOptions] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<number, RecipeOption>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus auto à l'ouverture
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fermeture sur Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Fetch des recettes (debounced)
  useEffect(() => {
    const handle = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        if (onlyNoFolder) params.set("onlyNoFolder", "1");
        else params.set("excludeFolder", String(folder.id));
        params.set("limit", "50");

        const res = await fetch(`/api/recipes?${params.toString()}`);
        if (myId !== reqIdRef.current) return;
        if (!res.ok) {
          setError(`Erreur ${res.status}`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { recipes: RecipeOption[] };
        if (myId !== reqIdRef.current) return;
        setOptions(data.recipes);
        setLoading(false);
      } catch (e) {
        if (myId !== reqIdRef.current) return;
        setError(e instanceof Error ? e.message : "Erreur réseau");
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, onlyNoFolder, folder.id]);

  function toggleSelect(opt: RecipeOption) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.set(opt.id, opt);
      return next;
    });
  }

  function handleSubmit() {
    if (selected.size === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await assignRecipesToFolder(
        folder.id,
        Array.from(selected.keys()),
      );
      if (r.ok) {
        onClose();
      } else {
        setError(r.error);
      }
    });
  }

  // Sous-ensemble visible (cache les déjà sélectionnés de la liste)
  const visibleOptions = options.filter((o) => !selected.has(o.id));

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
          maxWidth: 560,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          maxHeight: "85vh",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="fl-title-serif inline-flex items-center gap-2" style={{ fontSize: "1.1rem" }}>
            Ajouter des recettes à{" "}
            <span
              className="inline-flex items-center gap-1"
              style={{ color: folder.color }}
            >
              <Icon name="Folder" size={16} style={{ color: folder.color }} />{" "}
              {folder.name}
            </span>
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

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyNoFolder}
            onChange={(e) => setOnlyNoFolder(e.target.checked)}
            className="accent-[color:var(--accent)]"
          />
          <span className="fl-label" style={{ color: "var(--text)" }}>
            N&apos;afficher que les recettes sans dossier
          </span>
        </label>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une recette…"
          className="fl-input"
        />

        {/* Chips des sélectionnées */}
        {selected.size > 0 && (
          <div
            className="flex flex-wrap gap-1.5"
            style={{
              padding: "8px 10px",
              background: "var(--surface)",
              borderRadius: 6,
              border: "1px dashed var(--border)",
            }}
          >
            {Array.from(selected.values()).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleSelect(opt)}
                className="fl-tag"
                style={{
                  background: `${folder.color}33`,
                  color: folder.color,
                  borderColor: `${folder.color}88`,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                title="Retirer"
              >
                {opt.name}
                <span style={{ opacity: 0.7 }}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* Liste des recettes */}
        <div
          className="flex flex-col rounded-md"
          style={{
            border: "1px solid var(--border)",
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          {loading ? (
            <div
              className="px-3 py-3 text-sm"
              style={{ color: "var(--muted)" }}
            >
              Chargement…
            </div>
          ) : visibleOptions.length === 0 ? (
            <div
              className="px-3 py-3 text-sm"
              style={{ color: "var(--muted)" }}
            >
              {query.trim()
                ? "Aucune recette ne correspond."
                : onlyNoFolder
                  ? "Toutes tes recettes sont déjà rangées dans un dossier."
                  : "Aucune autre recette à ranger ici."}
            </div>
          ) : (
            visibleOptions.map((opt, idx) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleSelect(opt)}
                className="px-3 py-2 text-sm text-left transition-colors hover:bg-[color:var(--surface)] flex items-center justify-between gap-2"
                style={{
                  borderTop: idx === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <span style={{ color: "var(--text)" }}>{opt.name}</span>
                {opt.folder && (
                  <span
                    className="fl-tag inline-flex items-center gap-1"
                    style={{
                      background: `${opt.folder.color}1f`,
                      color: opt.folder.color,
                      borderColor: `${opt.folder.color}55`,
                      fontSize: "0.55rem",
                    }}
                  >
                    <Icon name="Folder" size={10} style={{ color: opt.folder.color }} />{" "}
                    {opt.folder.name}
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
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
            disabled={pending || selected.size === 0}
            className="fl-btn fl-btn-primary"
          >
            <span className="inline-flex items-center gap-2">
              {pending
                ? "Rangement…"
                : selected.size === 0
                  ? "Choisis au moins une recette"
                  : `Ranger ${selected.size} recette${selected.size > 1 ? "s" : ""}`}
              {!pending && selected.size > 0 && (
                <>
                  <Icon name="ArrowRight" size={14} />
                  <Icon
                    name="Folder"
                    size={14}
                    style={{ color: folder.color }}
                  />
                </>
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
