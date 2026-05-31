"use client";

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  capitalizeIngredientBase,
  deleteIngredientBase,
  mergeIngredientBases,
} from "@/app/actions/settings";

type IngredientBase = {
  id: number;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  _count: { usages: number };
};

type SortKey = "az" | "za" | "most" | "least" | "none" | "newest" | "modified";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "az",       label: "A → Z" },
  { key: "za",       label: "Z → A" },
  { key: "most",     label: "+ recettes" },
  { key: "least",    label: "− recettes" },
  { key: "none",     label: "Aucune recette" },
  { key: "newest",   label: "Ajoutés récemment" },
  { key: "modified", label: "Modifiés récemment" },
];

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("az");
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
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

  function openMerge(id: number) {
    setMergingId(id);
    setMergeSearch("");
    setMergeTargetId(null);
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
    let list = ingredientBases.filter((i) =>
      i.name.toLowerCase().includes(search.toLowerCase()),
    );
    if (sort === "none") list = list.filter((i) => i._count.usages === 0);
    switch (sort) {
      case "az":       list = [...list].sort((a, b) => a.name.localeCompare(b.name, "fr")); break;
      case "za":       list = [...list].sort((a, b) => b.name.localeCompare(a.name, "fr")); break;
      case "most":     list = [...list].sort((a, b) => b._count.usages - a._count.usages); break;
      case "least":    list = [...list].sort((a, b) => a._count.usages - b._count.usages); break;
      case "newest":   list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "modified": list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()); break;
    }
    return list;
  }, [ingredientBases, search, sort]);

  const zeroCount = ingredientBases.filter((i) => i._count.usages === 0).length;

  return (
    <div className="flex flex-col gap-3">
      {ingredientBases.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun ingrédient pour le moment. Ils s&apos;ajoutent automatiquement quand tu
          crées ou modifies des recettes.
        </p>
      )}

      {/* Barre de recherche + tri */}
      {ingredientBases.length > 0 && (
        <div className="flex flex-col gap-2">
          <input
            type="search"
            placeholder="Filtrer par nom…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="fl-input"
            style={{ fontSize: "0.9rem" }}
          />
          <div className="flex flex-wrap gap-1.5">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sort === opt.key;
              const label = opt.key === "none"
                ? `${opt.label}${zeroCount > 0 ? ` (${zeroCount})` : ""}`
                : opt.label;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  style={{
                    padding: "0.25rem 0.6rem",
                    fontSize: "0.72rem",
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
                  {label}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
            {sorted.length} / {ingredientBases.length} ingrédient{ingredientBases.length > 1 ? "s" : ""}
          </p>
        </div>
      )}

      {error && (
        <p style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>
      )}

      {sorted.map((ing) => {
        const firstLetterLower = ing.name.charAt(0) !== ing.name.charAt(0).toUpperCase();
        const isMerging = mergingId === ing.id;

        const mergeOptions = ingredientBases.filter(
          (i) => i.id !== ing.id && i.name.toLowerCase().includes(mergeSearch.toLowerCase()),
        ).slice(0, 8);

        return (
          <div key={ing.id} className="flex flex-col gap-2 py-1 border-b border-[color:var(--border)] last:border-0 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <Link
                href={`/settings/ingredients/${ing.id}`}
                className="flex items-center gap-2 min-w-0 sm:flex-1 hover:opacity-80"
                style={{
                  padding: "0.4rem 0.75rem",
                  background: "var(--surface-alt, rgba(255,255,255,0.04))",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  textDecoration: "none",
                }}
              >
                <span style={{ fontSize: "0.9rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", flex: 1 }}>
                  {ing.name}
                </span>
                <span style={{ fontSize: "0.75rem", color: ing._count.usages === 0 ? "var(--danger)" : "var(--muted)", flexShrink: 0 }}>
                  {ing._count.usages === 0 ? "0 recette" : `${ing._count.usages} recette${ing._count.usages !== 1 ? "s" : ""}`}
                </span>
              </Link>

              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                {firstLetterLower && (
                  <button
                    type="button"
                    title={`Capitaliser → ${ing.name.charAt(0).toUpperCase() + ing.name.slice(1)}`}
                    onClick={() => handleCapitalize(ing.id, ing.name)}
                    disabled={pending}
                    className="fl-btn fl-btn-secondary"
                    style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", fontWeight: 600 }}
                  >
                    Aa
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => isMerging ? cancelMerge() : openMerge(ing.id)}
                  disabled={pending}
                  className={`fl-btn ${isMerging ? "fl-btn-primary" : "fl-btn-secondary"}`}
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                >
                  {isMerging ? "✕ Annuler" : "⇌ Fusionner"}
                </button>
                <Link
                  href={`/settings/ingredients/${ing.id}`}
                  className="fl-btn fl-btn-secondary"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                >
                  Gérer →
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(ing.id, ing.name)}
                  disabled={pending}
                  className="fl-btn"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem", color: "var(--danger)" }}
                >
                  Supprimer
                </button>
              </div>
            </div>

            {isMerging && (
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.75rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                }}
              >
                <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                  Fusionner <strong style={{ color: "var(--text)" }}>« {ing.name} »</strong> dans… (toutes ses recettes seront mises à jour)
                </p>
                <input
                  type="search"
                  placeholder="Rechercher l'ingrédient cible…"
                  value={mergeSearch}
                  onChange={(e) => { setMergeSearch(e.target.value); setMergeTargetId(null); }}
                  className="fl-input"
                  style={{ fontSize: "0.85rem" }}
                  autoFocus
                />
                {mergeOptions.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", maxHeight: 200, overflowY: "auto" }}>
                    {mergeOptions.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMergeTargetId(opt.id === mergeTargetId ? null : opt.id)}
                        style={{
                          textAlign: "left",
                          padding: "0.4rem 0.7rem",
                          borderRadius: 6,
                          border: "1px solid",
                          borderColor: mergeTargetId === opt.id ? "var(--accent)" : "var(--border)",
                          background: mergeTargetId === opt.id ? "rgba(232,197,71,0.1)" : "transparent",
                          color: "var(--text)",
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                        }}
                      >
                        {opt.name}
                        <span style={{ color: "var(--muted)", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                          {opt._count.usages} recette{opt._count.usages !== 1 ? "s" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {mergeSearch.length > 0 && mergeOptions.length === 0 && (
                  <p style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Aucun résultat.</p>
                )}
                {mergeTargetId && (
                  <button
                    type="button"
                    onClick={() => handleMerge(ing.id, ing.name)}
                    disabled={pending}
                    className="fl-btn fl-btn-primary"
                    style={{ fontSize: "0.85rem", alignSelf: "flex-start" }}
                  >
                    {pending ? "Fusion…" : `⇌ Fusionner dans « ${ingredientBases.find((i) => i.id === mergeTargetId)?.name} »`}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sorted.length === 0 && ingredientBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          {sort === "none" ? "Tous les ingrédients ont au moins une recette." : `Aucun résultat pour « ${search} ».`}
        </p>
      )}
    </div>
  );
}
