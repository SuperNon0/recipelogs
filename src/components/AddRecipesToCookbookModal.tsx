"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addMultipleRecipesToCookbook, addMultipleRecipesWithMassTarget } from "@/app/actions/cookbooks";

type RecipeOption = {
  id: number;
  name: string;
  folderId: number | null;
  folder: { name: string; color: string } | null;
};

type LinkMode = "linked" | "snapshot" | "mass_target";

const DEBOUNCE_MS = 200;

export function AddRecipesToCookbookModal({
  cookbookId,
  onClose,
}: {
  cookbookId: number;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RecipeOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<number, RecipeOption>>(new Map());
  const [linkMode, setLinkMode] = useState<LinkMode>("linked");
  const [targetMass, setTargetMass] = useState("1000");
  const [forceExact, setForceExact] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; skipped: number } | null>(null);
  const reqIdRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const handle = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "100" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/recipes?${params.toString()}`);
        if (myId !== reqIdRef.current) return;
        if (!res.ok) { setLoading(false); return; }
        const data = (await res.json()) as { recipes: RecipeOption[] };
        if (myId !== reqIdRef.current) return;
        setOptions(data.recipes);
        setLoading(false);
      } catch {
        if (myId !== reqIdRef.current) return;
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  function toggleSelect(opt: RecipeOption) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(opt.id)) next.delete(opt.id);
      else next.set(opt.id, opt);
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    setResult(null);
    const ids = Array.from(selected.keys());
    startTransition(async () => {
      let r;
      if (linkMode === "mass_target") {
        const mass = Number(targetMass);
        if (!Number.isFinite(mass) || mass <= 0) {
          setError("Masse cible invalide.");
          return;
        }
        r = await addMultipleRecipesWithMassTarget(cookbookId, ids, mass, forceExact);
      } else {
        r = await addMultipleRecipesToCookbook(cookbookId, ids, linkMode);
      }
      if (!r.ok) { setError(r.error); return; }
      setResult({ added: r.added ?? 0, skipped: r.skipped ?? 0 });
      setSelected(new Map());
    });
  }

  const visibleOptions = options.filter((o) => !selected.has(o.id));

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500,
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(6px)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "100%", maxWidth: 560, margin: "0 auto",
          background: "var(--card)",
          borderRadius: "20px 20px 0 0",
          maxHeight: "90vh",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Poignée */}
        <div style={{ display: "flex", justifyContent: "center", padding: "0.75rem 0 0" }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid var(--border)" }}>
          <h2 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
            📖 Ajouter des recettes au cahier
          </h2>
          {selected.size > 0 && (
            <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 4 }}>
              {selected.size} recette{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Chips sélectionnées */}
        {selected.size > 0 && (
          <div
            style={{
              display: "flex", flexWrap: "wrap", gap: "0.4rem",
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              maxHeight: 120, overflowY: "auto",
            }}
          >
            {Array.from(selected.values()).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleSelect(r)}
                style={{
                  display: "flex", alignItems: "center", gap: "0.35rem",
                  padding: "0.2rem 0.55rem",
                  borderRadius: 20,
                  border: "1px solid var(--accent)",
                  background: "rgba(232,197,71,0.12)",
                  color: "var(--accent)",
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                }}
              >
                {r.name} <span style={{ opacity: 0.7 }}>×</span>
              </button>
            ))}
          </div>
        )}

        {/* Corps scrollable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

          {/* Barre de recherche */}
          <input
            ref={inputRef}
            type="search"
            placeholder="Rechercher une recette…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="fl-input"
            style={{ fontSize: "0.9rem" }}
          />

          {/* Mode de liaison */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            {([
              { key: "linked", label: "🔗 Liée" },
              { key: "snapshot", label: "📌 Figée" },
              { key: "mass_target", label: "⚖ Masse cible" },
            ] as { key: LinkMode; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setLinkMode(key)}
                style={{
                  flex: 1,
                  padding: "0.45rem 0.3rem",
                  borderRadius: 8,
                  border: "1px solid",
                  borderColor: linkMode === key ? "var(--accent)" : "var(--border)",
                  background: linkMode === key ? "rgba(232,197,71,0.1)" : "transparent",
                  color: linkMode === key ? "var(--accent)" : "var(--muted)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Champ masse cible */}
          {linkMode === "mass_target" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span className="fl-label" style={{ whiteSpace: "nowrap" }}>Masse cible (g)</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={targetMass}
                  onChange={(e) => setTargetMass(e.target.value)}
                  className="fl-input"
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={forceExact}
                  onChange={(e) => setForceExact(e.target.checked)}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "var(--accent)" }}
                />
                <span className="fl-label" style={{ fontWeight: forceExact ? 600 : 400, color: forceExact ? "var(--accent)" : "var(--muted)" }}>
                  Masse exacte (ajuste ±1 g sur les plus gros ingrédients)
                </span>
              </label>
              {!forceExact && (
                <p className="fl-label" style={{ fontWeight: 400, color: "var(--muted)", fontSize: "0.72rem" }}>
                  La masse réelle peut être légèrement supérieure (arrondi au gramme supérieur).
                </p>
              )}
            </div>
          )}

          {/* Liste des recettes */}
          {loading && (
            <p style={{ fontSize: "0.82rem", color: "var(--muted)", textAlign: "center" }}>Chargement…</p>
          )}
          {!loading && visibleOptions.length === 0 && query.length > 0 && (
            <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Aucun résultat pour « {query} ».</p>
          )}
          {!loading && visibleOptions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {visibleOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleSelect(opt)}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.55rem 0.75rem",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  />
                  <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: "0.88rem", color: "var(--text)" }}>
                    {opt.name}
                  </span>
                  {opt.folder && (
                    <span
                      style={{
                        fontSize: "0.7rem", fontFamily: "var(--font-mono)",
                        padding: "0.1rem 0.4rem", borderRadius: 4,
                        background: `${opt.folder.color}22`,
                        color: opt.folder.color,
                        border: `1px solid ${opt.folder.color}44`,
                        flexShrink: 0,
                      }}
                    >
                      {opt.folder.name}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: "1px solid var(--border)",
            display: "flex", flexDirection: "column", gap: "0.5rem",
          }}
        >
          {error && <p style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</p>}
          {result && (
            <p style={{ fontSize: "0.82rem", color: "var(--accent)" }}>
              ✓ {result.added} recette{result.added > 1 ? "s" : ""} ajoutée{result.added > 1 ? "s" : ""}
              {result.skipped > 0 && ` · ${result.skipped} déjà présente${result.skipped > 1 ? "s" : ""}`}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={pending || selected.size === 0}
              className="fl-btn fl-btn-primary"
              style={{ flex: 1, fontSize: "0.9rem" }}
            >
              {pending
                ? "Ajout en cours…"
                : selected.size === 0
                  ? "Sélectionner des recettes"
                  : linkMode === "mass_target"
                    ? `Ajouter ${selected.size} recette${selected.size > 1 ? "s" : ""} à ${targetMass} g →`
                    : `Ajouter ${selected.size} recette${selected.size > 1 ? "s" : ""} →`}
            </button>
            <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary" style={{ fontSize: "0.9rem" }}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
