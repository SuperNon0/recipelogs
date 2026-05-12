"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Category = { id: number; name: string; color: string };

/**
 * Sélecteur de catégories façon combobox :
 * - les catégories sélectionnées s'affichent en chips au-dessus avec un × pour retirer
 * - une saisie filtre la liste à la frappe ; un bouton ▾ ouvre la liste complète
 * - Enter sélectionne le 1er résultat ; clic sur un item l'ajoute aux chips
 *
 * Remplace la grille de boutons quand on a beaucoup de catégories.
 */
export function CategoryCombobox({
  allCategories,
  initialSelected = [],
}: {
  allCategories: Category[];
  initialSelected?: number[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    new Set(initialSelected),
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Ferme le dropdown si on clique en dehors
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const byId = useMemo(() => {
    const m = new Map<number, Category>();
    for (const c of allCategories) m.set(c.id, c);
    return m;
  }, [allCategories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allCategories
      .filter((c) => !selectedIds.has(c.id))
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true));
    list.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    return list;
  }, [allCategories, selectedIds, query]);

  function add(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setQuery("");
  }

  function remove(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[0]) add(filtered[0].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && query === "" && selectedIds.size > 0) {
      // retire la dernière chip si l'input est vide
      const last = Array.from(selectedIds).pop();
      if (last !== undefined) remove(last);
    }
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2 relative">
      {/* Chips sélectionnées */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Array.from(selectedIds).map((id) => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => remove(c.id)}
                className="fl-tag"
                style={{
                  background: `${c.color}33`,
                  color: c.color,
                  borderColor: `${c.color}88`,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                aria-label={`Retirer ${c.name}`}
                title="Cliquer pour retirer"
              >
                {c.name}
                <span style={{ opacity: 0.7 }}>×</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Input + bouton ▾ */}
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
          placeholder={
            selectedIds.size === 0
              ? "Tape pour filtrer (ex. : chocolat)"
              : "Ajouter une catégorie…"
          }
          className="fl-input flex-1"
          style={{ minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fl-btn fl-btn-secondary"
          style={{
            padding: "0.4rem 0.7rem",
            fontSize: "0.85rem",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 120ms ease",
          }}
          aria-label={open ? "Fermer la liste" : "Voir toute la liste"}
          title="Voir toute la liste"
        >
          ▾
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 right-0 z-30 flex flex-col rounded-md overflow-hidden"
          style={{
            top: "100%",
            marginTop: 4,
            maxHeight: 280,
            overflowY: "auto",
            background: "var(--card)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
          }}
        >
          {filtered.length === 0 ? (
            <div
              className="px-3 py-2 text-sm"
              style={{ color: "var(--muted)" }}
            >
              {selectedIds.size === allCategories.length
                ? "Toutes les catégories sont déjà sélectionnées."
                : "Aucune catégorie ne correspond."}
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c.id)}
                className="px-3 py-2 text-sm text-left transition-colors hover:bg-[color:var(--surface)]"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <span
                  className="fl-tag"
                  style={{
                    background: `${c.color}1f`,
                    color: c.color,
                    borderColor: `${c.color}55`,
                  }}
                >
                  {c.name}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Champs cachés pour le submit du formulaire (compat existante) */}
      {Array.from(selectedIds).map((id) => (
        <input key={id} type="hidden" name="categoryIds" value={id} />
      ))}
    </div>
  );
}
