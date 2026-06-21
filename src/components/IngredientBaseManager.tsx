"use client";

import Link from "next/link";
import { useState, useTransition, useOptimistic, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  capitalizeIngredientBase,
  deleteIngredientBase,
  deleteIngredientBasesBulk,
  mergeIngredientBases,
  mergeIngredientBasesBulk,
  setIngredientCategory,
  setIngredientCategoryBulk,
} from "@/app/actions/settings";

type IngredientCategory = "base" | "fruit" | "preparation" | null;

type IngredientBase = {
  id: number;
  name: string;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { usages: number };
};

type SortKey = "az" | "za" | "most" | "least" | "none" | "nocap" | "newest" | "modified";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az",       label: "A → Z" },
  { key: "za",       label: "Z → A" },
  { key: "most",     label: "+ recettes" },
  { key: "least",    label: "− recettes" },
  { key: "none",     label: "Sans recette" },
  { key: "nocap",    label: "Minuscule" },
  { key: "newest",   label: "Récents" },
  { key: "modified", label: "Modifiés" },
];

const KNOWN_CATEGORIES = ["base", "fruit", "preparation"] as const;

const CATEGORIES: { key: IngredientCategory; label: string; emoji: string; color: string }[] = [
  { key: null,          label: "À classer",    emoji: "📋", color: "var(--muted)" },
  { key: "base",        label: "Base",         emoji: "🧂", color: "var(--accent)" },
  { key: "fruit",       label: "Arôme",        emoji: "🌿", color: "#6db86d" },
  { key: "preparation", label: "Préparation",  emoji: "🍳", color: "#6b9fd4" },
];

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticBases, addOptimistic] = useOptimistic(
    ingredientBases,
    (state, { id, category }: { id: number; category: IngredientCategory }) =>
      state.map((ing) => (ing.id === id ? { ...ing, category } : ing)),
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [classifyingId, setClassifyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set<number>());
  // Fusion en lot : panneau « fusionner les sélectionnés dans… »
  const [bulkMerging, setBulkMerging] = useState(false);
  const [bulkMergeSearch, setBulkMergeSearch] = useState("");
  const [bulkMergeTargetId, setBulkMergeTargetId] = useState<number | null>(null);

  function handleDelete(id: number, name: string) {
    if (!confirm(`Supprimer « ${name} » de la base ?\n\nLes recettes qui utilisent cet ingrédient ne sont pas modifiées.`)) return;
    setError(null);
    setActiveMenuId(null);
    void startTransition(async (): Promise<void> => {
      await deleteIngredientBase(id);
    });
  }

  function handleCapitalize(id: number, name: string) {
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    if (capitalized === name) return;
    setError(null);
    setActiveMenuId(null);
    void startTransition(async (): Promise<void> => {
      const r = await capitalizeIngredientBase(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function handleSetCategory(id: number, category: IngredientCategory) {
    setError(null);
    setClassifyingId(null);
    setActiveMenuId(null);
    void startTransition(async (): Promise<void> => {
      addOptimistic({ id, category });
      const r = await setIngredientCategory(id, category);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set<number>());
    setBulkMerging(false);
    setBulkMergeSearch("");
    setBulkMergeTargetId(null);
  }

  function handleBulkSetCategory(category: IngredientCategory) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      for (const id of ids) addOptimistic({ id, category });
      const r = await setIngredientCategoryBulk(ids, category);
      if (!r.ok) { setError(r.error); return; }
      exitSelection();
      router.refresh();
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Supprimer ${ids.length} ingrédient${ids.length > 1 ? "s" : ""} de la base ?\n\nLes recettes qui les utilisent ne sont pas modifiées. Cette action est irréversible.`)) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      const r = await deleteIngredientBasesBulk(ids);
      if (!r.ok) { setError(r.error); return; }
      exitSelection();
      router.refresh();
    });
  }

  function handleBulkMerge() {
    const ids = Array.from(selectedIds).filter((id) => id !== bulkMergeTargetId);
    if (!bulkMergeTargetId || ids.length === 0) return;
    const target = ingredientBases.find((i) => i.id === bulkMergeTargetId);
    if (!target) return;
    if (!confirm(`Fusionner ${ids.length} ingrédient${ids.length > 1 ? "s" : ""} dans « ${target.name} » ?\n\nToutes les recettes concernées seront mises à jour avec « ${target.name} ». Cette action est irréversible.`)) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      const r = await mergeIngredientBasesBulk(ids, bulkMergeTargetId);
      if (!r.ok) { setError(r.error); return; }
      exitSelection();
      router.refresh();
    });
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openMerge(id: number) {
    setMergingId(id);
    setMergeSearch("");
    setMergeTargetId(null);
    setClassifyingId(null);
    setActiveMenuId(null);
    setError(null);
  }

  function cancelMerge() {
    setMergingId(null);
    setMergeSearch("");
    setMergeTargetId(null);
  }

  function handleMerge(sourceId: number, sourceName: string) {
    if (!mergeTargetId) return;
    const target = ingredientBases.find((i) => i.id === mergeTargetId);
    if (!target) return;
    if (!confirm(`Fusionner « ${sourceName} » dans « ${target.name} » ?\n\nToutes les recettes qui utilisent « ${sourceName} » seront mises à jour avec « ${target.name} ». Cette action est irréversible.`)) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      const r = await mergeIngredientBases(sourceId, mergeTargetId);
      if (!r.ok) { setError(r.error); return; }
      cancelMerge();
      router.refresh();
    });
  }

  const sorted = useMemo(() => {
    let list = optimisticBases.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()),
    );
    if (sort === "none")  list = list.filter((i) => i._count.usages === 0);
    if (sort === "nocap") list = list.filter((i) => i.name.charAt(0) !== i.name.charAt(0).toUpperCase());
    switch (sort) {
      case "az":       list = [...list].sort((a, b) => a.name.localeCompare(b.name, "fr")); break;
      case "za":       list = [...list].sort((a, b) => b.name.localeCompare(a.name, "fr")); break;
      case "most":     list = [...list].sort((a, b) => b._count.usages - a._count.usages); break;
      case "least":    list = [...list].sort((a, b) => a._count.usages - b._count.usages); break;
      case "newest":   list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "modified": list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); break;
    }
    return list;
  }, [optimisticBases, search, sort]);

  const zeroCount  = optimisticBases.filter((i) => i._count.usages === 0).length;
  const nocapCount = optimisticBases.filter((i) => i.name.charAt(0) !== i.name.charAt(0).toUpperCase()).length;

  return (
    <div className="flex flex-col gap-4">
      {optimisticBases.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun ingrédient pour le moment. Ils s&apos;ajoutent automatiquement quand tu
          crées ou modifies des recettes.
        </p>
      )}

      {optimisticBases.length > 0 && (
        <div className="flex flex-col gap-3 sticky top-0 z-10 pb-2" style={{ background: "var(--card)" }}>
          <input
            type="search"
            placeholder="Filtrer par nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fl-input"
            style={{ fontSize: "1rem", padding: "0.65rem 1rem" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sort === opt.key;
              const badge =
                opt.key === "none"  && zeroCount  > 0 ? ` ${zeroCount}` :
                opt.key === "nocap" && nocapCount > 0 ? ` ${nocapCount}` :
                "";
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  style={{
                    padding: "0.3rem 0.65rem",
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono)",
                    borderRadius: 6,
                    border: "1px solid",
                    borderColor: isActive ? "var(--accent)" : "var(--border)",
                    background: isActive ? "rgba(232,197,71,0.12)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {opt.label}{badge}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
              {sorted.length} / {optimisticBases.length} ingrédient{optimisticBases.length > 1 ? "s" : ""}
            </p>
            <button
              type="button"
              onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              style={{
                padding: "0.3rem 0.7rem",
                fontSize: "0.75rem",
                fontFamily: "var(--font-mono)",
                borderRadius: 6,
                border: "1px solid",
                borderColor: selectionMode ? "var(--accent)" : "var(--border)",
                background: selectionMode ? "rgba(232,197,71,0.12)" : "transparent",
                color: selectionMode ? "var(--accent)" : "var(--muted)",
                cursor: "pointer",
                fontWeight: selectionMode ? 600 : 400,
              }}
              title="Sélectionner plusieurs ingrédients (classer, fusionner, supprimer)"
            >
              {selectionMode ? "✕ Annuler la sélection" : "☑ Sélectionner"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>
      )}

      {optimisticBases.length > 0 && (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          }}
        >
          {CATEGORIES.map((cat) => {
            const catItems = sorted.filter((ing) =>
              cat.key === null
                ? ing.category === null || !KNOWN_CATEGORIES.includes(ing.category as typeof KNOWN_CATEGORIES[number])
                : ing.category === cat.key,
            );

            return (
              <CategoryColumn
                key={String(cat.key)}
                cat={cat}
                items={catItems}
                search={search}
                pending={pending}
                activeMenuId={activeMenuId}
                setActiveMenuId={setActiveMenuId}
                mergingId={mergingId}
                mergeSearch={mergeSearch}
                setMergeSearch={setMergeSearch}
                mergeTargetId={mergeTargetId}
                setMergeTargetId={setMergeTargetId}
                classifyingId={classifyingId}
                setClassifyingId={setClassifyingId}
                ingredientBases={ingredientBases}
                onDelete={handleDelete}
                onCapitalize={handleCapitalize}
                onSetCategory={handleSetCategory}
                onOpenMerge={openMerge}
                onCancelMerge={cancelMerge}
                onMerge={handleMerge}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelected={toggleSelected}
                onSelectAllInColumn={(ids) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) next.add(id);
                    return next;
                  })
                }
                onDeselectAllInColumn={(ids) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of ids) next.delete(id);
                    return next;
                  })
                }
              />
            );
          })}
        </div>
      )}

      {sorted.length === 0 && optimisticBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          {sort === "none"  ? "Tous les ingrédients ont au moins une recette." :
           sort === "nocap" ? "Toutes les premières lettres sont déjà en majuscule." :
           `Aucun résultat pour « ${search} ».`}
        </p>
      )}

      {/* Barre d'action flottante (mode sélection global) */}
      {selectionMode && (
        <BulkActionBar
          count={selectedIds.size}
          pending={pending}
          bulkMerging={bulkMerging}
          bulkMergeSearch={bulkMergeSearch}
          setBulkMergeSearch={setBulkMergeSearch}
          bulkMergeTargetId={bulkMergeTargetId}
          setBulkMergeTargetId={setBulkMergeTargetId}
          mergeOptions={
            bulkMerging
              ? ingredientBases
                  .filter(
                    (i) =>
                      !selectedIds.has(i.id) &&
                      i.name.toLowerCase().includes(bulkMergeSearch.toLowerCase()),
                  )
                  .slice(0, 8)
              : []
          }
          onSetCategory={handleBulkSetCategory}
          onOpenMerge={() => { setBulkMerging(true); setBulkMergeSearch(""); setBulkMergeTargetId(null); }}
          onCancelMerge={() => { setBulkMerging(false); setBulkMergeSearch(""); setBulkMergeTargetId(null); }}
          onConfirmMerge={handleBulkMerge}
          onDelete={handleBulkDelete}
          onCancel={exitSelection}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Barre d'action flottante (sélection multiple)
// ─────────────────────────────────────────────

function BulkActionBar({
  count,
  pending,
  bulkMerging,
  bulkMergeSearch,
  setBulkMergeSearch,
  bulkMergeTargetId,
  setBulkMergeTargetId,
  mergeOptions,
  onSetCategory,
  onOpenMerge,
  onCancelMerge,
  onConfirmMerge,
  onDelete,
  onCancel,
}: {
  count: number;
  pending: boolean;
  bulkMerging: boolean;
  bulkMergeSearch: string;
  setBulkMergeSearch: (v: string) => void;
  bulkMergeTargetId: number | null;
  setBulkMergeTargetId: (v: number | null) => void;
  mergeOptions: IngredientBase[];
  onSetCategory: (category: IngredientCategory) => void;
  onOpenMerge: () => void;
  onCancelMerge: () => void;
  onConfirmMerge: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const disabled = pending || count === 0;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
        zIndex: 90,
        width: "calc(100% - 2rem)",
        maxWidth: 560,
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
        padding: "0.75rem 0.9rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.6rem",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          style={{
            flex: 1,
            fontSize: "0.85rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text)",
          }}
        >
          {count} sélectionné{count > 1 ? "s" : ""}
        </span>
        <button type="button" onClick={onCancel} disabled={pending} className="fl-btn" style={{ fontSize: "0.78rem" }}>
          Fermer
        </button>
      </div>

      {bulkMerging ? (
        <div className="flex flex-col gap-1.5">
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: 0 }}>
            Fusionner les {count} sélectionnés dans…
          </p>
          <input
            type="search"
            placeholder="Rechercher l'ingrédient cible…"
            value={bulkMergeSearch}
            onChange={(e) => { setBulkMergeSearch(e.target.value); setBulkMergeTargetId(null); }}
            className="fl-input"
            style={{ fontSize: "0.78rem", padding: "0.4rem 0.6rem" }}
            autoFocus
          />
          {mergeOptions.length > 0 && (
            <div className="flex flex-col gap-0.5" style={{ maxHeight: 160, overflowY: "auto" }}>
              {mergeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBulkMergeTargetId(opt.id === bulkMergeTargetId ? null : opt.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.3rem 0.5rem",
                    borderRadius: 5,
                    border: "1px solid",
                    borderColor: bulkMergeTargetId === opt.id ? "var(--accent)" : "var(--border)",
                    background: bulkMergeTargetId === opt.id ? "rgba(232,197,71,0.1)" : "transparent",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                  }}
                >
                  {opt.name}
                  <span style={{ color: "var(--muted)", fontSize: "0.65rem", marginLeft: "0.3rem" }}>
                    {opt._count.usages}r
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onConfirmMerge}
              disabled={pending || !bulkMergeTargetId}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.78rem", opacity: !bulkMergeTargetId ? 0.5 : 1 }}
            >
              {pending ? "Fusion…" : "Fusionner"}
            </button>
            <button type="button" onClick={onCancelMerge} disabled={pending} className="fl-btn" style={{ fontSize: "0.78rem" }}>
              Retour
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Classer dans une catégorie */}
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={String(c.key)}
                type="button"
                onClick={() => onSetCategory(c.key)}
                disabled={disabled}
                title={`Classer les sélectionnés dans « ${c.label} »`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                  fontSize: "0.74rem",
                  padding: "0.35rem 0.55rem",
                  borderRadius: 6,
                  border: `1px solid ${c.color}`,
                  background: `${c.color}1a`,
                  color: c.color,
                  cursor: disabled ? "default" : "pointer",
                  fontFamily: "var(--font-mono)",
                  fontWeight: 600,
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>

          {/* Fusionner / Supprimer */}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={onOpenMerge}
              disabled={disabled}
              className="fl-btn"
              style={{ fontSize: "0.78rem", opacity: disabled ? 0.5 : 1 }}
            >
              ⇄ Fusionner
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="fl-btn"
              style={{
                fontSize: "0.78rem",
                background: disabled ? "transparent" : "var(--danger)",
                color: disabled ? "var(--muted)" : "#fff",
                borderColor: "var(--danger)",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              🗑 Supprimer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Colonne catégorie
// ─────────────────────────────────────────────

function CategoryColumn({
  cat,
  items,
  search,
  pending,
  activeMenuId,
  setActiveMenuId,
  mergingId,
  mergeSearch,
  setMergeSearch,
  mergeTargetId,
  setMergeTargetId,
  classifyingId,
  setClassifyingId,
  ingredientBases,
  onDelete,
  onCapitalize,
  onSetCategory,
  onOpenMerge,
  onCancelMerge,
  onMerge,
  selectionMode,
  selectedIds,
  onToggleSelected,
  onSelectAllInColumn,
  onDeselectAllInColumn,
}: {
  cat: { key: IngredientCategory; label: string; emoji: string; color: string };
  items: IngredientBase[];
  search: string;
  pending: boolean;
  activeMenuId: number | null;
  setActiveMenuId: (id: number | null) => void;
  mergingId: number | null;
  mergeSearch: string;
  setMergeSearch: (v: string) => void;
  mergeTargetId: number | null;
  setMergeTargetId: (v: number | null) => void;
  classifyingId: number | null;
  setClassifyingId: (v: number | null) => void;
  ingredientBases: IngredientBase[];
  onDelete: (id: number, name: string) => void;
  onCapitalize: (id: number, name: string) => void;
  onSetCategory: (id: number, category: IngredientCategory) => void;
  onOpenMerge: (id: number) => void;
  onCancelMerge: () => void;
  onMerge: (sourceId: number, sourceName: string) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelected: (id: number) => void;
  onSelectAllInColumn: (ids: number[]) => void;
  onDeselectAllInColumn: (ids: number[]) => void;
}) {
  const selectedCount = selectionMode ? items.filter((i) => selectedIds.has(i.id)).length : 0;
  const allSelected = items.length > 0 && selectedCount === items.length;
  return (
    <div
      style={{
        background: "var(--surface-alt, rgba(255,255,255,0.02))",
        border: "1px solid var(--border)",
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        minHeight: 80,
      }}
    >
      {/* En-tête */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <span style={{ fontSize: "1.2rem" }}>{cat.emoji}</span>
        <span
          style={{
            flex: 1,
            fontSize: "0.9rem",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            color: cat.color,
          }}
        >
          {cat.label}
        </span>
        {selectionMode && items.length > 0 && (
          <button
            type="button"
            onClick={() =>
              allSelected
                ? onDeselectAllInColumn(items.map((i) => i.id))
                : onSelectAllInColumn(items.map((i) => i.id))
            }
            title={allSelected ? "Tout désélectionner dans cette colonne" : "Tout sélectionner dans cette colonne"}
            style={{
              fontSize: "0.68rem",
              fontFamily: "var(--font-mono)",
              padding: "0.2rem 0.5rem",
              borderRadius: 5,
              border: "1px solid",
              borderColor: allSelected ? "var(--accent)" : "var(--border)",
              background: allSelected ? "rgba(232,197,71,0.12)" : "transparent",
              color: allSelected ? "var(--accent)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {allSelected ? "✓ Tout" : "Tout"}
          </button>
        )}
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          {selectionMode && selectedCount > 0 ? `${selectedCount}/${items.length}` : items.length}
        </span>
      </div>

      {/* Liste scrollable — colonne « À classer » plus haute (gros volume à trier) */}
      <div
        className="fl-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          maxHeight: cat.key === null ? "72vh" : 420,
          padding: "0.25rem 0",
        }}
      >
        {items.length === 0 ? (
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", textAlign: "center", padding: "1rem 0" }}>
            {search ? "Aucun résultat" : "Vide"}
          </p>
        ) : (
          items.map((ing) => (
            <IngredientRow
              key={ing.id}
              ing={ing}
              catKey={cat.key}
              quickClassify={cat.key === null && !selectionMode}
              pending={pending}
              isMenuOpen={activeMenuId === ing.id}
              setMenuOpen={(open) => setActiveMenuId(open ? ing.id : null)}
              isMerging={mergingId === ing.id}
              isClassifying={classifyingId === ing.id}
              mergeSearch={mergeSearch}
              setMergeSearch={setMergeSearch}
              mergeTargetId={mergeTargetId}
              setMergeTargetId={setMergeTargetId}
              ingredientBases={ingredientBases}
              onDelete={onDelete}
              onCapitalize={onCapitalize}
              onSetCategory={onSetCategory}
              onOpenMerge={onOpenMerge}
              onCancelMerge={onCancelMerge}
              onMerge={onMerge}
              onToggleClassify={() => setClassifyingId(classifyingId === ing.id ? null : ing.id)}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(ing.id)}
              onToggleSelected={onToggleSelected}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Ligne ingrédient
// ─────────────────────────────────────────────

function IngredientRow({
  ing,
  catKey,
  quickClassify,
  pending,
  isMenuOpen,
  setMenuOpen,
  isMerging,
  isClassifying,
  mergeSearch,
  setMergeSearch,
  mergeTargetId,
  setMergeTargetId,
  ingredientBases,
  onDelete,
  onCapitalize,
  onSetCategory,
  onOpenMerge,
  onCancelMerge,
  onMerge,
  onToggleClassify,
  selectionMode,
  isSelected,
  onToggleSelected,
}: {
  ing: IngredientBase;
  catKey: IngredientCategory;
  quickClassify: boolean;
  pending: boolean;
  isMenuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
  isMerging: boolean;
  isClassifying: boolean;
  mergeSearch: string;
  setMergeSearch: (v: string) => void;
  mergeTargetId: number | null;
  setMergeTargetId: (v: number | null) => void;
  ingredientBases: IngredientBase[];
  onDelete: (id: number, name: string) => void;
  onCapitalize: (id: number, name: string) => void;
  onSetCategory: (id: number, category: IngredientCategory) => void;
  onOpenMerge: (id: number) => void;
  onCancelMerge: () => void;
  onMerge: (sourceId: number, sourceName: string) => void;
  onToggleClassify: () => void;
  selectionMode: boolean;
  isSelected: boolean;
  onToggleSelected: (id: number) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const firstLetterLower = ing.name.charAt(0) !== ing.name.charAt(0).toUpperCase();

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleOutside(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [isMenuOpen, setMenuOpen]);

  const mergeOptions = isMerging
    ? ingredientBases
        .filter((i) => i.id !== ing.id && i.name.toLowerCase().includes(mergeSearch.toLowerCase()))
        .slice(0, 8)
    : [];

  return (
    <div
      className="flex flex-col gap-1.5 px-3 py-2"
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.03)",
        background: selectionMode && isSelected ? "rgba(232,197,71,0.08)" : undefined,
        cursor: selectionMode ? "pointer" : undefined,
      }}
      onClick={selectionMode ? () => onToggleSelected(ing.id) : undefined}
    >
      {/* Nom + count + menu */}
      <div className="flex items-center gap-2 min-w-0">
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelected(ing.id); }}
            style={{
              width: 22,
              height: 22,
              flexShrink: 0,
              borderRadius: 5,
              border: isSelected ? "2px solid var(--accent)" : "2px solid var(--border)",
              background: isSelected ? "var(--accent)" : "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.7rem",
              color: isSelected ? "var(--bg)" : "transparent",
              transition: "all 100ms ease",
            }}
            aria-label={isSelected ? "Désélectionner" : "Sélectionner"}
          >
            {isSelected ? "✓" : ""}
          </button>
        )}
        {selectionMode ? (
          <span
            className="flex-1 min-w-0"
            style={{
              fontSize: "0.9rem",
              fontFamily: "var(--font-mono)",
              color: "var(--text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {ing.name}
          </span>
        ) : (
          <Link
            href={`/settings/ingredients/${ing.id}`}
            className="flex-1 min-w-0"
            style={{
              fontSize: "0.9rem",
              fontFamily: "var(--font-mono)",
              color: "var(--text)",
              textDecoration: "none",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={ing.name}
          >
            {ing.name}
          </Link>
        )}
        <span
          style={{
            fontSize: "0.75rem",
            color: ing._count.usages === 0 ? "var(--danger)" : "var(--muted)",
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
          }}
        >
          {ing._count.usages}r
        </span>

        {/* Menu contextuel ··· (masqué en mode sélection) */}
        {!selectionMode && (
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen(!isMenuOpen)}
            style={{
              background: isMenuOpen ? "var(--border)" : "transparent",
              border: "none",
              borderRadius: 4,
              padding: "0.15rem 0.4rem",
              fontSize: "0.9rem",
              color: "var(--muted)",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ···
          </button>
          {isMenuOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                zIndex: 60,
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                minWidth: 150,
                boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
              }}
            >
              {firstLetterLower && (
                <MenuButton
                  label={`Aa → ${ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}`}
                  onClick={() => onCapitalize(ing.id, ing.name)}
                  disabled={pending}
                />
              )}
              {!quickClassify && (
                <MenuButton
                  label="Classer"
                  onClick={() => { setMenuOpen(false); onToggleClassify(); }}
                  disabled={pending}
                />
              )}
              {!quickClassify && (
                <MenuButton
                  label="Fusionner"
                  onClick={() => { setMenuOpen(false); onOpenMerge(ing.id); }}
                  disabled={pending}
                />
              )}
              <MenuButton
                label="Voir la fiche"
                onClick={() => {}}
                href={`/settings/ingredients/${ing.id}`}
              />
              <MenuButton
                label="Supprimer"
                onClick={() => onDelete(ing.id, ing.name)}
                disabled={pending}
                danger
              />
            </div>
          )}
        </div>
        )}
      </div>

      {/* Classement rapide : 1 tap vers une catégorie (colonne « À classer ») */}
      {quickClassify && (
        <div className="grid grid-cols-3 gap-1 pt-0.5">
          {CATEGORIES.filter((c) => c.key !== null).map((c) => (
            <button
              key={String(c.key)}
              type="button"
              onClick={() => onSetCategory(ing.id, c.key)}
              disabled={pending}
              title={`Classer dans « ${c.label} »`}
              aria-label={`Classer dans ${c.label}`}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.25rem",
                fontSize: "0.72rem",
                padding: "0.4rem 0.3rem",
                borderRadius: 6,
                border: `1px solid ${c.color}`,
                background: `${c.color}1a`,
                color: c.color,
                cursor: pending ? "default" : "pointer",
                fontFamily: "var(--font-mono)",
                opacity: pending ? 0.5 : 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <span style={{ fontSize: "0.95rem", lineHeight: 1 }}>{c.emoji}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Fusion en accès direct (colonne « À classer ») */}
      {quickClassify && !isMerging && (
        <button
          type="button"
          onClick={() => onOpenMerge(ing.id)}
          disabled={pending}
          title="Fusionner dans un autre ingrédient"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.3rem",
            fontSize: "0.68rem",
            padding: "0.3rem 0.4rem",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--muted)",
            cursor: pending ? "default" : "pointer",
            fontFamily: "var(--font-mono)",
            opacity: pending ? 0.5 : 1,
          }}
        >
          ⇄ Fusionner
        </button>
      )}

      {/* Picker de catégorie */}
      {isClassifying && (
        <div className="grid grid-cols-2 gap-1 pt-0.5">
          {CATEGORIES.map((c) => {
            const isCurrentCol = c.key === catKey;
            return (
              <button
                key={String(c.key)}
                type="button"
                onClick={() => onSetCategory(ing.id, c.key)}
                disabled={pending || isCurrentCol}
                style={{
                  fontSize: "0.72rem",
                  padding: "0.35rem 0.5rem",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: isCurrentCol ? c.color : "var(--border)",
                  background: isCurrentCol ? `${c.color}22` : "transparent",
                  color: isCurrentCol ? c.color : "var(--text)",
                  cursor: isCurrentCol ? "default" : "pointer",
                  fontFamily: "var(--font-mono)",
                  textAlign: "left",
                  opacity: isCurrentCol ? 0.5 : 1,
                }}
              >
                {c.emoji} {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Panel fusion */}
      {isMerging && (
        <div className="flex flex-col gap-1 pt-0.5">
          <p style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
            Fusionner dans…
          </p>
          <input
            type="search"
            placeholder="Rechercher…"
            value={mergeSearch}
            onChange={(e) => { setMergeSearch(e.target.value); setMergeTargetId(null); }}
            className="fl-input"
            style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem" }}
            autoFocus
          />
          {mergeOptions.length > 0 && (
            <div className="flex flex-col gap-0.5" style={{ maxHeight: 130, overflowY: "auto" }}>
              {mergeOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setMergeTargetId(opt.id === mergeTargetId ? null : opt.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.25rem 0.4rem",
                    borderRadius: 4,
                    border: "1px solid",
                    borderColor: mergeTargetId === opt.id ? "var(--accent)" : "var(--border)",
                    background: mergeTargetId === opt.id ? "rgba(232,197,71,0.1)" : "transparent",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.72rem",
                    cursor: "pointer",
                  }}
                >
                  {opt.name}
                  <span style={{ color: "var(--muted)", fontSize: "0.65rem", marginLeft: "0.3rem" }}>
                    {opt._count.usages}r
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            {mergeTargetId && (
              <button
                type="button"
                onClick={() => onMerge(ing.id, ing.name)}
                disabled={pending}
                className="fl-btn fl-btn-primary"
                style={{ fontSize: "0.68rem", padding: "0.25rem 0.5rem" }}
              >
                {pending ? "…" : "Fusionner"}
              </button>
            )}
            <button
              type="button"
              onClick={onCancelMerge}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.68rem", padding: "0.25rem 0.5rem" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Bouton du menu contextuel
// ─────────────────────────────────────────────

function MenuButton({
  label,
  onClick,
  disabled,
  danger,
  href,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  href?: string;
}) {
  const style: React.CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left" as const,
    padding: "0.45rem 0.75rem",
    fontSize: "0.78rem",
    fontFamily: "var(--font-mono)",
    color: danger ? "var(--danger)" : "var(--text)",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid var(--border)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };

  if (href) {
    return (
      <Link href={href} style={style}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      onMouseEnter={(e) => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = "var(--border)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
    >
      {label}
    </button>
  );
}
