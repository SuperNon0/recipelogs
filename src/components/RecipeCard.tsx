"use client";

import Link from "next/link";
import type { RecipeListItem } from "@/lib/recipes";
import { useRecipeSelection } from "@/components/RecipeSelection";

function formatG(value: number): string {
  if (!value) return "0 g";
  if (value >= 1000) {
    return (
      (value / 1000).toLocaleString("fr-FR", {
        maximumFractionDigits: 2,
      }) + " kg"
    );
  }
  return (
    Math.round(value).toLocaleString("fr-FR") + " g"
  );
}

export function RecipeCard({ recipe, from }: { recipe: RecipeListItem; from?: string }) {
  const { selectionMode, isSelected, toggle } = useRecipeSelection();
  const href = from
    ? `/recipes/${recipe.id}?from=${encodeURIComponent(from)}`
    : `/recipes/${recipe.id}`;

  const selected = selectionMode && isSelected(recipe.id);

  // Contenu commun (titre, catégories, masse, note, tags)
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        {selectionMode && (
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              borderRadius: 5,
              border: selected ? "2px solid var(--accent)" : "2px solid var(--border)",
              background: selected ? "var(--accent)" : "transparent",
              color: selected ? "var(--bg)" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.75rem",
              marginTop: 2,
            }}
          >
            {selected ? "✓" : ""}
          </span>
        )}
        <h3
          className="fl-title-serif"
          style={{ fontSize: "1.15rem", flex: 1 }}
        >
          {recipe.name}
        </h3>
        {recipe.favorite && (
          <span
            aria-label="Favori"
            style={{ color: "var(--accent)", fontSize: "1.1rem" }}
          >
            ★
          </span>
        )}
      </div>

      {recipe.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.categories.map((c) => (
            <span
              key={c.id}
              className="fl-tag"
              style={{
                background: `${c.color}22`,
                color: c.color,
                borderColor: `${c.color}55`,
              }}
            >
              {c.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between mt-auto">
        <div className="flex flex-col">
          <span className="fl-label">Masse totale</span>
          <span className="fl-value-serif" style={{ fontSize: "1.55rem" }}>
            {formatG(recipe.totalMassG)}
          </span>
        </div>
        {recipe.rating && (
          <div
            className="flex gap-0.5"
            style={{ color: "var(--accent)", fontSize: "0.85rem" }}
          >
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                style={{
                  opacity: i < (recipe.rating ?? 0) ? 1 : 0.25,
                }}
              >
                ★
              </span>
            ))}
          </div>
        )}
      </div>

      {recipe.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 5).map((t) => (
            <span key={t} className="fl-tag">
              #{t}
            </span>
          ))}
          {recipe.tags.length > 5 && (
            <span className="fl-tag">+{recipe.tags.length - 5}</span>
          )}
        </div>
      )}
    </>
  );

  // En mode sélection : la carte coche/décoche au lieu de naviguer.
  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={() => toggle(recipe.id)}
        className="fl-card flex flex-col gap-3 text-left transition-colors"
        style={{
          borderColor: selected ? "var(--accent)" : undefined,
          background: selected ? "rgba(232,197,71,0.08)" : undefined,
          cursor: "pointer",
        }}
        aria-pressed={selected}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className="fl-card flex flex-col gap-3 hover:border-[color:var(--muted)] transition-colors"
    >
      {inner}
    </Link>
  );
}
