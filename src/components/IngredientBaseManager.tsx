"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  capitalizeIngredientBase,
  deleteIngredientBase,
  mergeIngredientBases,
} from "@/app/actions/settings";

type IngredientBase = { id: number; name: string; _count: { usages: number } };

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
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

  const filtered = ingredientBases.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-3">
      {ingredientBases.length === 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun ingrédient pour le moment. Ils s&apos;ajoutent automatiquement quand tu
          crées ou modifies des recettes.
        </p>
      )}

      {ingredientBases.length > 5 && (
        <input
          type="search"
          placeholder="Filtrer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fl-input"
          style={{ fontSize: "0.9rem" }}
        />
      )}

      {error && (
        <p style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>
      )}

      {filtered.map((ing) => {
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
                <span style={{ fontSize: "0.75rem", color: "var(--muted)", flexShrink: 0 }}>
                  {ing._count.usages} recette{ing._count.usages !== 1 ? "s" : ""}
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

      {filtered.length === 0 && ingredientBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">Aucun résultat pour « {search} ».</p>
      )}
    </div>
  );
}
