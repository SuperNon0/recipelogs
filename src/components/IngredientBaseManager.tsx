"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteIngredientBase } from "@/app/actions/settings";

type IngredientBase = { id: number; name: string; _count: { usages: number } };

export function IngredientBaseManager({
  ingredientBases,
}: {
  ingredientBases: IngredientBase[];
}) {
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");

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

      {filtered.map((ing) => (
        <div
          key={ing.id}
          className="flex flex-col sm:flex-row sm:items-center gap-2 py-1"
        >
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
            <span
              style={{
                fontSize: "0.9rem",
                color: "var(--text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: "var(--font-mono)",
                flex: 1,
              }}
            >
              {ing.name}
            </span>
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--muted)",
                flexShrink: 0,
              }}
            >
              {ing._count.usages} recette{ing._count.usages !== 1 ? "s" : ""}
            </span>
          </Link>
          <div className="flex items-center gap-2 flex-shrink-0">
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
      ))}

      {filtered.length === 0 && ingredientBases.length > 0 && (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun résultat pour « {search} ».
        </p>
      )}
    </div>
  );
}
