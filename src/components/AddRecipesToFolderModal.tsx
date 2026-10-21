"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderInput, Plus, Search, X } from "lucide-react";
import { assignRecipesToFolder } from "@/app/actions/settings";
import { ModalOverlay } from "./ModalOverlay";

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
 *  - Bouton primaire « Ranger N recette(s) »
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
  const router = useRouter();

  // Focus auto à l'ouverture
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
        router.refresh();
        onClose();
      } else {
        setError(r.error);
      }
    });
  }

  // Sous-ensemble visible (cache les déjà sélectionnés de la liste)
  const visibleOptions = options.filter((o) => !selected.has(o.id));

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <FolderInput size={18} style={{ color: folder.color, flex: "none" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Ranger dans « {folder.name} »</span>
        </span>
      }
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          role="switch"
          aria-checked={onlyNoFolder}
          className="fl-switch"
          onClick={() => setOnlyNoFolder(!onlyNoFolder)}
          aria-label="Seulement les recettes sans dossier"
        />
        <span style={{ fontSize: 13.5, color: "var(--soft)" }}>Seulement les recettes sans dossier</span>
      </div>

      <label className="searchbox">
        <Search size={16} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une recette…"
        />
      </label>

      {selected.size > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Array.from(selected.values()).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleSelect(opt)}
              className="fl-chip"
              aria-pressed="true"
              title="Retirer de la sélection"
            >
              {opt.name}
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      <div className="fl-scroll" style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)", maxHeight: 300, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Chargement…</div>
        ) : visibleOptions.length === 0 ? (
          <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>
            {query.trim()
              ? "Aucune recette ne correspond."
              : onlyNoFolder
                ? "Toutes tes recettes sont déjà rangées dans un dossier."
                : "Aucune autre recette à ranger ici."}
          </div>
        ) : (
          visibleOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleSelect(opt)}
              className="pdf-theme-opt"
              style={{ margin: 0, borderRadius: 0, borderBottom: "1px solid var(--border)" }}
            >
              <Plus size={15} style={{ color: "var(--muted)", flex: "none" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.name}</span>
              {opt.folder && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", flex: "none" }}>
                  <span className="dot" style={{ background: opt.folder.color }} />
                  {opt.folder.name}
                </span>
              )}
            </button>
          ))
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={pending} className="fl-btn fl-btn-secondary">
          Annuler
        </button>
        <button type="button" onClick={handleSubmit} disabled={pending || selected.size === 0} className="fl-btn fl-btn-primary">
          {pending
            ? "Rangement…"
            : selected.size === 0
              ? "Choisis des recettes"
              : `Ranger ${selected.size} recette${selected.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </ModalOverlay>
  );
}
