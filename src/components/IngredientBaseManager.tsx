"use client";

import Link from "next/link";
import { useState, useTransition, useOptimistic, useMemo } from "react";
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
  { key: "none",     label: "Aucune recette" },
  { key: "nocap",    label: "Majuscule manquante" },
  { key: "newest",   label: "Ajoutés récemment" },
  { key: "modified", label: "Modifiés récemment" },
];

const KNOWN_CATEGORIES = ["base", "fruit", "preparation"] as const;

const CATEGORIES: { key: IngredientCategory; label: string; emoji: string; color: string }[] = [
  { key: null,          label: "À classer",          emoji: "📋", color: "var(--muted)" },
  { key: "base",        label: "Ingrédient de base",  emoji: "🧂", color: "var(--accent)" },
  { key: "fruit",       label: "Arôme",               emoji: "🌿", color: "#6db86d" },
  { key: "preparation", label: "Préparation",          emoji: "🍳", color: "#6b9fd4" },
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
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [classifyingId, setClassifyingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleDelete(id: number, name: string) {
    if (!confirm(`Supprimer « ${name} » de la base ?\n\nLes recettes qui utilisent cet ingrédient ne sont pas modifiées.`)) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      await deleteIngredientBase(id);
    });
  }

  function handleCapitalize(id: number, name: string) {
    const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
    if (capitalized === name) return;
    setError(null);
    void startTransition(async (): Promise<void> => {
      const r = await capitalizeIngredientBase(id);
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function handleSetCategory(id: number, category: IngredientCategory) {
    setError(null);
    setClassifyingId(null);
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
        <div className="flex flex-col gap-2">
          <input
            type="search"
            placeholder="Filtrer par nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fl-input"
            style={{ fontSize: "1.05rem", padding: "0.75rem 1rem" }}
          />
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sort === opt.key;
              const label =
                opt.key === "none"  ? `${opt.label}${zeroCount  > 0 ? ` (${zeroCount})`  : ""}` :
                opt.key === "nocap" ? `${opt.label}${nocapCount > 0 ? ` (${nocapCount})` : ""}` :
                opt.label;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  style={{
                    padding: "0.4rem 0.85rem",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-mono)",
                    borderRadius: 8,
                    border: "1px solid",
                    borderColor: isActive ? "var(--accent)" : "var(--border)",
                    background: isActive ? "rgba(232,197,71,0.12)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--muted)",
                    cursor: "pointer",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            {sorted.length} / {optimisticBases.length} ingrédient{optimisticBases.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>
      )}

      {/* 4 colonnes responsives */}
      {ingredientBases.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-start">
          {CATEGORIES.map((cat) => {
            const catItems = sorted.filter((ing) =>
              cat.key === null
                ? ing.category === null || !KNOWN_CATEGORIES.includes(ing.category as typeof KNOWN_CATEGORIES[number])
                : ing.category === cat.key,
            );

            return (
              <div
                key={String(cat.key)}
                style={{
                  background: "var(--surface-alt, rgba(255,255,255,0.02))",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "1.4rem",
                  minHeight: 100,
                }}
              >
                {/* En-tête colonne */}
                <div
                  className="flex items-center gap-2 mb-4 pb-3"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span style={{ fontSize: "1.5rem" }}>{cat.emoji}</span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: "1.05rem",
                      fontFamily: "var(--font-mono)",
                      fontWeight: 600,
                      color: cat.color,
                    }}
                  >
                    {cat.label}
                  </span>
                  <span style={{ fontSize: "0.9rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                    {catItems.length}
                  </span>
                </div>

                {/* Liste ingrédients */}
                {catItems.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", textAlign: "center", padding: "0.5rem 0" }}>
                    {search ? "Aucun résultat" : "Vide"}
                  </p>
                ) : (
                  <div className="flex flex-col divide-y divide-[color:var(--border)]">
                    {catItems.map((ing) => {
                      const firstLetterLower = ing.name.charAt(0) !== ing.name.charAt(0).toUpperCase();
                      const isMerging = mergingId === ing.id;
                      const isClassifying = classifyingId === ing.id;

                      const mergeOptions = ingredientBases.filter(
                        (i) => i.id !== ing.id && i.name.toLowerCase().includes(mergeSearch.toLowerCase()),
                      ).slice(0, 8);

                      return (
                        <div key={ing.id} className="flex flex-col gap-2 py-3">
                          {/* Nom + count */}
                          <div className="flex items-start gap-2 min-w-0">
                            <Link
                              href={`/settings/ingredients/${ing.id}`}
                              className="flex-1 min-w-0 hover:opacity-75"
                              style={{
                                fontSize: "1.05rem",
                                fontFamily: "var(--font-mono)",
                                color: "var(--text)",
                                textDecoration: "none",
                                lineHeight: 1.35,
                                wordBreak: "break-word",
                              }}
                            >
                              {ing.name}
                            </Link>
                            <span
                              style={{
                                fontSize: "0.88rem",
                                color: ing._count.usages === 0 ? "var(--danger)" : "var(--muted)",
                                flexShrink: 0,
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {ing._count.usages}r
                            </span>
                          </div>

                          {/* Boutons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {firstLetterLower && (
                              <button
                                type="button"
                                title={`Capitaliser → ${ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}`}
                                onClick={() => handleCapitalize(ing.id, ing.name)}
                                disabled={pending}
                                className="fl-btn fl-btn-secondary"
                                style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", fontWeight: 600 }}
                              >
                                Aa
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isClassifying) {
                                  setClassifyingId(null);
                                } else {
                                  setClassifyingId(ing.id);
                                  cancelMerge();
                                }
                              }}
                              disabled={pending}
                              className={`fl-btn ${isClassifying ? "fl-btn-primary" : "fl-btn-secondary"}`}
                              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
                            >
                              {isClassifying ? "✕" : "Classer"}
                            </button>
                            <button
                              type="button"
                              onClick={() => isMerging ? cancelMerge() : openMerge(ing.id)}
                              disabled={pending}
                              className={`fl-btn ${isMerging ? "fl-btn-primary" : "fl-btn-secondary"}`}
                              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
                            >
                              {isMerging ? "✕" : "⇌"}
                            </button>
                            <Link
                              href={`/settings/ingredients/${ing.id}`}
                              className="fl-btn fl-btn-secondary"
                              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem" }}
                            >
                              →
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleDelete(ing.id, ing.name)}
                              disabled={pending}
                              className="fl-btn"
                              style={{ fontSize: "0.85rem", padding: "0.45rem 0.9rem", color: "var(--danger)" }}
                            >
                              Supp
                            </button>
                          </div>

                          {/* Picker de catégorie */}
                          {isClassifying && (
                            <div className="flex flex-col gap-1.5 pt-1">
                              <div className="grid grid-cols-2 gap-1.5">
                                {CATEGORIES.map((c) => {
                                  const isCurrentCol = c.key === cat.key;
                                  return (
                                    <button
                                      key={String(c.key)}
                                      type="button"
                                      onClick={() => handleSetCategory(ing.id, c.key)}
                                      disabled={pending || isCurrentCol}
                                      style={{
                                        fontSize: "0.82rem",
                                        padding: "0.45rem 0.6rem",
                                        borderRadius: 6,
                                        border: "1px solid",
                                        borderColor: isCurrentCol ? c.color : "var(--border)",
                                        background: isCurrentCol ? `${c.color}22` : "transparent",
                                        color: isCurrentCol ? c.color : "var(--text)",
                                        cursor: isCurrentCol ? "default" : "pointer",
                                        fontFamily: "var(--font-mono)",
                                        textAlign: "left",
                                        opacity: isCurrentCol ? 0.7 : 1,
                                      }}
                                    >
                                      {c.emoji} {c.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Panel fusion */}
                          {isMerging && (
                            <div className="flex flex-col gap-1 pt-0.5">
                              <p style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                                Fusionner <strong style={{ color: "var(--text)" }}>« {ing.name} »</strong> dans…
                              </p>
                              <input
                                type="search"
                                placeholder="Rechercher l'ingrédient cible…"
                                value={mergeSearch}
                                onChange={(e) => { setMergeSearch(e.target.value); setMergeTargetId(null); }}
                                className="fl-input"
                                style={{ fontSize: "0.75rem" }}
                                autoFocus
                              />
                              {mergeOptions.length > 0 && (
                                <div className="flex flex-col gap-0.5" style={{ maxHeight: 160, overflowY: "auto" }}>
                                  {mergeOptions.map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => setMergeTargetId(opt.id === mergeTargetId ? null : opt.id)}
                                      style={{
                                        textAlign: "left",
                                        padding: "0.3rem 0.5rem",
                                        borderRadius: 6,
                                        border: "1px solid",
                                        borderColor: mergeTargetId === opt.id ? "var(--accent)" : "var(--border)",
                                        background: mergeTargetId === opt.id ? "rgba(232,197,71,0.1)" : "transparent",
                                        color: "var(--text)",
                                        fontFamily: "var(--font-mono)",
                                        fontSize: "0.75rem",
                                        cursor: "pointer",
                                      }}
                                    >
                                      {opt.name}
                                      <span style={{ color: "var(--muted)", fontSize: "0.68rem", marginLeft: "0.4rem" }}>
                                        {opt._count.usages}r
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {mergeSearch.length > 0 && mergeOptions.length === 0 && (
                                <p style={{ fontSize: "0.72rem", color: "var(--muted)" }}>Aucun résultat.</p>
                              )}
                              {mergeTargetId && (
                                <button
                                  type="button"
                                  onClick={() => handleMerge(ing.id, ing.name)}
                                  disabled={pending}
                                  className="fl-btn fl-btn-primary"
                                  style={{ fontSize: "0.72rem", padding: "0.3rem 0.5rem", alignSelf: "flex-start" }}
                                >
                                  {pending ? "Fusion…" : `⇌ → « ${ingredientBases.find((i) => i.id === mergeTargetId)?.name} »`}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sorted.length === 0 && ingredientBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          {sort === "none"  ? "Tous les ingrédients ont au moins une recette." :
           sort === "nocap" ? "Toutes les premières lettres sont déjà en majuscule. 🎉" :
           `Aucun résultat pour « ${search} ».`}
        </p>
      )}
    </div>
  );
}
