"use client";

import { useState, useTransition } from "react";
import { renameIngredientBase, deleteIngredientBase } from "@/app/actions/settings";

type IngredientBase = { id: number; name: string };

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  function handleRename(id: number, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    void startTransition(async (): Promise<void> => {
      const result = await renameIngredientBase(id, fd);
      if (result.ok) setEditingId(null);
      else setError(result.error);
    });
  }

  function handleDelete(id: number, name: string) {
    if (
      !confirm(
        `Supprimer « ${name} » de la base ?\n\nLes recettes qui utilisent cet ingrédient ne sont pas modifiées.`,
      )
    )
      return;
    void startTransition(async (): Promise<void> => {
      await deleteIngredientBase(id);
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

      {filtered.map((ing) =>
        editingId === ing.id ? (
          <form
            key={ing.id}
            onSubmit={(e) => handleRename(ing.id, e)}
            className="flex items-center gap-2"
          >
            <input
              name="name"
              defaultValue={ing.name}
              required
              maxLength={200}
              className="fl-input flex-1"
              style={{ fontSize: "0.9rem" }}
              autoFocus
            />
            <button
              type="submit"
              disabled={pending}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.8rem" }}
            >
              ✓
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.8rem" }}
            >
              ✕
            </button>
          </form>
        ) : (
          <div
            key={ing.id}
            className="flex flex-col sm:flex-row sm:items-center gap-2 py-1"
          >
            <div
              className="flex items-center gap-2 min-w-0 sm:flex-1"
              style={{
                padding: "0.4rem 0.75rem",
                background: "var(--surface-alt, rgba(255,255,255,0.04))",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              <span
                style={{
                  fontSize: "0.9rem",
                  color: "var(--text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {ing.name}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setEditingId(ing.id)}
                className="fl-btn fl-btn-secondary"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
              >
                Renommer
              </button>
              <button
                type="button"
                onClick={() => handleDelete(ing.id, ing.name)}
                disabled={pending}
                className="fl-btn"
                style={{
                  fontSize: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  color: "var(--danger)",
                }}
              >
                Supprimer
              </button>
            </div>
          </div>
        ),
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {filtered.length === 0 && ingredientBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun résultat pour « {search} ».
        </p>
      )}
    </div>
  );
}
