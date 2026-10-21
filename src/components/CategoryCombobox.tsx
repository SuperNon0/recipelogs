"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { createCategoryInline } from "@/app/actions/settings";

type Category = { id: number; name: string; color: string };

/** Couleurs proposées aux catégories créées depuis le formulaire. */
const NEW_CATEGORY_COLORS = ["#f0a64a", "#5fbf8f", "#6aa8f0", "#c58af0", "#ef7d6b", "#e8c547", "#4fc1c9"];

/**
 * Sélecteur de catégories façon combobox :
 * - les catégories choisies s'affichent en pastilles (clic = retirer)
 * - la saisie filtre la liste ; le bouton flèche ouvre la liste complète
 * - Entrée ajoute le 1er résultat, ou crée la catégorie si elle n'existe pas
 */
export function CategoryCombobox({
  allCategories,
  initialSelected = [],
  onChange,
}: {
  allCategories: Category[];
  initialSelected?: number[];
  /** Appelé à chaque ajout / retrait (pour marquer le formulaire comme modifié). */
  onChange?: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>(allCategories);
  const [selectedIds, setSelectedIds] = useState<number[]>(initialSelected);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, startCreate] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ferme la liste au clic en dehors
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      categories
        .filter((c) => !selectedIds.includes(c.id))
        .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
        .sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [categories, selectedIds, q],
  );
  const exactMatch = q !== "" && categories.some((c) => c.name.toLowerCase() === q);

  function add(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
    setError(null);
    onChange?.();
  }

  function remove(id: number) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    onChange?.();
  }

  function create() {
    const name = query.trim();
    if (!name) return;
    const color = NEW_CATEGORY_COLORS[categories.length % NEW_CATEGORY_COLORS.length];
    startCreate(async () => {
      const r = await createCategoryInline(name, color);
      if (!r.ok) return setError(r.error);
      setCategories((prev) => (prev.some((c) => c.id === r.category.id) ? prev : [...prev, r.category]));
      add(r.category.id);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[0]) add(filtered[0].id);
      else if (q && !exactMatch) create();
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selectedIds.length > 0) {
      // Retire la dernière pastille si le champ est vide
      remove(selectedIds[selectedIds.length - 1]);
    }
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2">
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => remove(c.id)}
                className="fl-tag rf-cat-chip"
                style={{ background: `${c.color}22`, color: c.color, borderColor: `${c.color}66` }}
                aria-label={`Retirer ${c.name}`}
                title="Retirer"
              >
                {c.name}
                <X size={13} />
              </button>
            );
          })}
        </div>
      )}

      <div style={{ position: "relative" }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={selectedIds.length === 0 ? "Choisis ou crée une catégorie" : "Ajouter une catégorie"}
            aria-label="Rechercher une catégorie"
            className="fl-input flex-1"
            style={{ minWidth: 0 }}
          />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="fl-btn fl-btn-secondary fl-btn-icon"
            aria-label={open ? "Fermer la liste" : "Voir toute la liste"}
            title="Voir toute la liste"
          >
            <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms ease" }} />
          </button>
        </div>

        {open && (
          <div className="rf-pop" role="listbox">
            {filtered.map((c) => (
              <button key={c.id} type="button" role="option" aria-selected={false} className="rf-pop-item" onClick={() => add(c.id)}>
                <span className="dot" style={{ background: c.color }} />
                {c.name}
              </button>
            ))}
            {q && !exactMatch && (
              <button type="button" className="rf-pop-item" onClick={create} disabled={creating} style={{ color: "var(--accent)" }}>
                <Plus size={15} />
                {creating ? "Création…" : <>Créer la catégorie « {query.trim()} »</>}
              </button>
            )}
            {filtered.length === 0 && !(q && !exactMatch) && (
              <div className="rf-pop-note">
                {selectedIds.length === categories.length
                  ? "Toutes les catégories sont déjà choisies."
                  : "Aucune catégorie ne correspond."}
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 12.5 }}>{error}</p>}

      {/* Champs cachés envoyés avec le formulaire */}
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="categoryIds" value={id} />
      ))}
    </div>
  );
}
