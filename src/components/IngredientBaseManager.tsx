"use client";

import Link from "next/link";
import { useState, useTransition, useOptimistic, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  capitalizeIngredientBase,
  deleteIngredientBase,
  mergeIngredientBases,
  setIngredientCategory,
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
          <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
            {sorted.length} / {optimisticBases.length} ingrédient{optimisticBases.length > 1 ? "s" : ""}
          </p>
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
}) {
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
        <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          {items.length}
        </span>
      </div>

      {/* Liste scrollable */}
      <div
        className="fl-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          maxHeight: 420,
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
}: {
  ing: IngredientBase;
  catKey: IngredientCategory;
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
      style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}
    >
      {/* Nom + count + menu */}
      <div className="flex items-center gap-2 min-w-0">
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

        {/* Menu contextuel ··· */}
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
              <MenuButton
                label="Classer"
                onClick={() => { setMenuOpen(false); onToggleClassify(); }}
                disabled={pending}
              />
              <MenuButton
                label="Fusionner"
                onClick={() => { setMenuOpen(false); onOpenMerge(ing.id); }}
                disabled={pending}
              />
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
      </div>

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
