"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

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

  useEffect(() => {
    setQ(sp.get("q") ?? "");
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
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam("q", q || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-3 mb-5">
      <input
        className="fl-input"
        placeholder="Rechercher une recette..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {allCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto fl-scroll-hidden pb-1">
          <button
            type="button"
            onClick={() => setParam("category", null)}
            className="fl-tag"
            style={{
              background: activeCategory
                ? "transparent"
                : "rgba(232, 197, 71, 0.15)",
              color: activeCategory ? "var(--muted)" : "var(--accent)",
              borderColor: activeCategory
                ? "var(--border)"
                : "rgba(232, 197, 71, 0.4)",
              cursor: "pointer",
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
                onClick={() =>
                  setParam("category", active ? null : String(c.id))
                }
                className="fl-tag"
                style={{
                  background: active ? `${c.color}33` : "transparent",
                  color: active ? c.color : "var(--muted)",
                  borderColor: active ? `${c.color}88` : "var(--border)",
                  cursor: "pointer",
                }}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex gap-2 overflow-x-auto fl-scroll-hidden pb-1">
          {allTags.slice(0, 30).map((t) => {
            const active = activeTag === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setParam("tag", active ? null : t)}
                className="fl-tag"
                style={{
                  background: active
                    ? "rgba(79, 195, 161, 0.15)"
                    : "transparent",
                  color: active ? "var(--accent-2)" : "var(--muted)",
                  borderColor: active
                    ? "rgba(79, 195, 161, 0.4)"
                    : "var(--border)",
                  cursor: "pointer",
                }}
              >
                #{t}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
