"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Hash, Search, X } from "lucide-react";

/**
 * Recherche par nom + filtres catégorie / tag, gardés dans l'adresse (?q=,
 * ?category=, ?tag=) pour pouvoir revenir en arrière ou partager le lien.
 */
export function RecipeFilters({
  allTags,
  allCategories,
}: {
  allTags: string[];
  allCategories: { id: number; name: string; color: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const typingRef = useRef(false);

  useEffect(() => {
    if (!typingRef.current) setQ(sp.get("q") ?? "");
  }, [sp]);

  const activeTag = sp.get("tag");
  const activeCategory = sp.get("category");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.push(`${pathname}?${next.toString()}`);
    });
  };

  useEffect(() => {
    typingRef.current = true;
    const t = setTimeout(() => {
      typingRef.current = false;
      if ((sp.get("q") ?? "") !== q) setParam("q", q || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
      <label className="searchbox">
        <Search size={16} />
        <input
          placeholder="Filtrer par nom de recette…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label="Filtrer les recettes par nom"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Effacer" style={{ background: "none", border: "none", color: "var(--muted)", display: "grid" }}>
            <X size={16} />
          </button>
        )}
      </label>

      {(allCategories.length > 0 || allTags.length > 0) && (
        <div className="chips" role="toolbar" aria-label="Filtres">
          <button
            type="button"
            className="fl-chip"
            aria-pressed={!activeCategory && !activeTag}
            onClick={() => {
              const next = new URLSearchParams(sp.toString());
              next.delete("category");
              next.delete("tag");
              startTransition(() => router.push(`${pathname}?${next.toString()}`));
            }}
          >
            Toutes
          </button>
          {allCategories.map((c) => {
            const active = String(c.id) === activeCategory;
            return (
              <button
                key={c.id}
                type="button"
                className="fl-chip"
                aria-pressed={active}
                onClick={() => setParam("category", active ? null : String(c.id))}
              >
                <span className="dot" style={{ background: c.color }} />
                {c.name}
              </button>
            );
          })}
          {allTags.slice(0, 30).map((t) => {
            const active = activeTag === t;
            return (
              <button
                key={t}
                type="button"
                className="fl-chip"
                aria-pressed={active}
                onClick={() => setParam("tag", active ? null : t)}
              >
                <Hash size={12} />
                {t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
