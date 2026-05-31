"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { renameIngredientBase, mergeIngredientBases } from "@/app/actions/settings";
import { useRouter } from "next/navigation";

type Recipe = { id: number; name: string; ingredientName: string };

export function IngredientDetailClient({
  base,
  recipes,
  otherBases,
}: {
  base: { id: number; name: string };
  recipes: Recipe[];
  otherBases: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [renaming, setRenaming] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string>("");
  const [mergeSearch, setMergeSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const r = await renameIngredientBase(base.id, fd);
      if (r.ok) {
        setRenaming(false);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  }

  function handleMerge() {
    if (!mergeTarget) return;
    const targetId = Number(mergeTarget);
    const targetBase = otherBases.find((b) => b.id === targetId);
    if (!targetBase) return;
    if (!confirm(`Fusionner « ${base.name} » dans « ${targetBase.name} » ?\n\nToutes les recettes utilisant « ${base.name} » seront mises à jour avec « ${targetBase.name} ». Cette action est irréversible.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await mergeIngredientBases(base.id, targetId);
      if (r.ok) {
        router.push("/settings/ingredients");
      } else {
        setError(r.error);
      }
    });
  }

  const filteredBases = otherBases.filter((b) =>
    b.name.toLowerCase().includes(mergeSearch.toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* ── Actions ──────────────────────────────────────────────── */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1rem" }}>Actions</h2>

        {renaming ? (
          <form onSubmit={handleRename} className="flex gap-2 items-center flex-wrap">
            <input
              name="name"
              defaultValue={base.name}
              required
              maxLength={200}
              autoFocus
              className="fl-input flex-1"
              style={{ fontSize: "0.9rem", minWidth: 180 }}
            />
            <button
              type="submit"
              disabled={pending}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.85rem" }}
            >
              {pending ? "…" : "✓ Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => { setRenaming(false); setError(null); }}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Annuler
            </button>
            <p className="fl-label w-full" style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
              ⚡ Le nom sera mis à jour dans toutes les recettes qui l&apos;utilisent.
            </p>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className="fl-btn fl-btn-secondary self-start"
            style={{ fontSize: "0.85rem" }}
          >
            ✏️ Renommer (et mettre à jour toutes les recettes)
          </button>
        )}

        {!renaming && (
          <>
            {merging ? (
              <div className="flex flex-col gap-2">
                <p className="fl-label" style={{ fontSize: "0.85rem" }}>
                  Fusionner <strong>{base.name}</strong> dans :
                </p>
                <input
                  type="text"
                  placeholder="Rechercher un ingrédient…"
                  value={mergeSearch}
                  onChange={(e) => setMergeSearch(e.target.value)}
                  className="fl-input"
                  style={{ fontSize: "0.85rem" }}
                  autoFocus
                />
                <div
                  style={{
                    maxHeight: 200,
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--surface)",
                  }}
                >
                  {filteredBases.length === 0 && (
                    <p style={{ padding: "0.6rem 0.8rem", fontSize: "0.85rem", color: "var(--muted)" }}>
                      Aucun résultat
                    </p>
                  )}
                  {filteredBases.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setMergeTarget(String(b.id))}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "0.45rem 0.8rem",
                        fontSize: "0.85rem",
                        fontFamily: "var(--font-mono)",
                        background: mergeTarget === String(b.id) ? "rgba(232,197,71,0.12)" : "transparent",
                        color: mergeTarget === String(b.id) ? "var(--accent)" : "var(--text)",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleMerge}
                    disabled={!mergeTarget || pending}
                    className="fl-btn fl-btn-primary"
                    style={{ fontSize: "0.85rem" }}
                  >
                    {pending ? "Fusion…" : "🔀 Fusionner"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMerging(false); setMergeTarget(""); setMergeSearch(""); setError(null); }}
                    className="fl-btn fl-btn-secondary"
                    style={{ fontSize: "0.85rem" }}
                  >
                    Annuler
                  </button>
                </div>
                {mergeTarget && (
                  <p className="fl-label" style={{ fontSize: "0.78rem", color: "var(--danger)" }}>
                    ⚠️ « {base.name} » sera supprimé et remplacé par « {otherBases.find(b => String(b.id) === mergeTarget)?.name} » dans toutes les recettes.
                  </p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMerging(true)}
                className="fl-btn fl-btn-secondary self-start"
                style={{ fontSize: "0.85rem" }}
                disabled={otherBases.length === 0}
              >
                🔀 Fusionner avec un autre ingrédient
              </button>
            )}
          </>
        )}

        {error && (
          <p style={{ fontSize: "0.85rem", color: "var(--danger)" }}>{error}</p>
        )}
      </section>

      {/* ── Recettes ─────────────────────────────────────────────── */}
      <section className="fl-card flex flex-col gap-3">
        <h2 className="fl-title-serif" style={{ fontSize: "1rem" }}>
          Recettes ({recipes.length})
        </h2>

        {recipes.length === 0 ? (
          <p className="fl-label" style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
            Aucune recette n&apos;utilise cet ingrédient pour le moment.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {recipes.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 py-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <div>
                  <Link
                    href={`/recipes/${r.id}`}
                    className="fl-label hover:text-[color:var(--text)]"
                    style={{ fontSize: "0.9rem", color: "var(--text)" }}
                  >
                    {r.name}
                  </Link>
                  {r.ingredientName !== base.name && (
                    <span className="fl-label" style={{ fontSize: "0.75rem", marginLeft: 8 }}>
                      (actuellement : « {r.ingredientName} »)
                    </span>
                  )}
                </div>
                <Link
                  href={`/recipes/${r.id}`}
                  className="fl-label hover:text-[color:var(--text)]"
                  style={{ fontSize: "0.75rem", flexShrink: 0 }}
                >
                  Voir →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
