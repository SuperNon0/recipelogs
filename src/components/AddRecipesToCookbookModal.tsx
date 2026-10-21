"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BookPlus, Check, Search, X } from "lucide-react";
import { addMultipleRecipesToCookbook, addMultipleRecipesWithMassTarget } from "@/app/actions/cookbooks";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { ExactToggle } from "./EditSnapshotMassModal";

type RecipeOption = {
  id: number;
  name: string;
  folderId: number | null;
  folder: { name: string; color: string } | null;
};

type LinkMode = "linked" | "snapshot" | "mass_target";

const DEBOUNCE_MS = 200;

/** Fenêtre « Ajouter des recettes » : recherche, sélection multiple, mode d'ajout. */
export function AddRecipesToCookbookModal({
  cookbookId,
  existingRecipeIds = [],
  onClose,
}: {
  cookbookId: number;
  existingRecipeIds?: number[];
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

  useEffect(() => {
    const handle = setTimeout(async () => {
      const myId = ++reqIdRef.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "0" });
        if (query.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/recipes?${params.toString()}`);
        if (myId !== reqIdRef.current) return;
        if (res.ok) {
          const data = (await res.json()) as { recipes: RecipeOption[] };
          if (myId !== reqIdRef.current) return;
          setOptions(data.recipes);
        }
      } catch {
        // Erreur réseau : on garde la liste précédente.
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  function toggleSelect(opt: RecipeOption) {
    setResult(null);
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
        const mass = Number(targetMass.replace(",", "."));
        if (!Number.isFinite(mass) || mass <= 0) {
          setError("Masse cible invalide.");
          return;
        }
        r = await addMultipleRecipesWithMassTarget(cookbookId, ids, mass, forceExact);
      } else {
        r = await addMultipleRecipesToCookbook(cookbookId, ids, linkMode);
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({ added: r.added ?? 0, skipped: r.skipped ?? 0 });
      setSelected(new Map());
    });
  }

  const existingSet = new Set(existingRecipeIds);
  const visibleOptions = options.filter((o) => !existingSet.has(o.id));
  const n = selected.size;

  const title = (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <BookPlus size={18} style={{ color: "var(--accent)" }} /> Ajouter des recettes
    </span>
  );

  return (
    <ModalOverlay onClose={onClose} title={title}>
      <div className="searchbox">
        <Search size={16} />
        <input
          type="search"
          placeholder="Rechercher une recette…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          aria-label="Rechercher une recette"
        />
      </div>

      {n > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 96, overflowY: "auto" }} className="fl-scroll">
          {Array.from(selected.values()).map((r) => (
            <button key={r.id} type="button" className="fl-chip" aria-pressed onClick={() => toggleSelect(r)} title="Retirer de la sélection">
              <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              <X size={13} />
            </button>
          ))}
        </div>
      )}

      <div className="fl-list fl-scroll" style={{ background: "var(--bg)", maxHeight: "min(42vh, 360px)", overflowY: "auto", flex: "none" }}>
        {loading && options.length === 0 && <p style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>Chargement…</p>}
        {!loading && visibleOptions.length === 0 && (
          <p style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>
            {query ? `Aucune recette pour « ${query} ».` : "Toutes les recettes sont déjà dans ce cahier."}
          </p>
        )}
        {visibleOptions.map((opt, i) => {
          const on = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleSelect(opt)}
              className="fl-row"
              style={{
                width: "100%",
                minHeight: 44,
                padding: "8px 14px",
                border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                background: on ? "var(--accent-dim)" : "transparent",
                color: "var(--text)",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  flex: "none",
                  display: "grid",
                  placeItems: "center",
                  border: `1.5px solid ${on ? "var(--accent)" : "var(--border2)"}`,
                  background: on ? "var(--accent)" : "transparent",
                  color: "var(--accent-ink)",
                }}
              >
                {on && <Check size={14} strokeWidth={3} />}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.name}</span>
              {opt.folder && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", flex: "none", maxWidth: "40%" }}>
                  <span className="dot" style={{ background: opt.folder.color }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.folder.name}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
          Ajouter en tant que
          <Help title="Liée, figée ou masse cible">
            <b>Liée</b> : le cahier affiche toujours la version actuelle de la recette ; si tu la
            modifies, le cahier suit.
            <br />
            <b>Figée</b> : le cahier garde une copie de la recette telle qu&apos;elle est aujourd&apos;hui.
            Les modifications futures de la recette ne la changent pas.
            <br />
            <b>Masse cible</b> : chaque recette est figée puis multipliée pour peser la masse indiquée.
          </Help>
        </span>
        <div className="fl-seg" style={{ alignSelf: "flex-start" }}>
          <button type="button" aria-pressed={linkMode === "linked"} onClick={() => setLinkMode("linked")}>
            Liée
          </button>
          <button type="button" aria-pressed={linkMode === "snapshot"} onClick={() => setLinkMode("snapshot")}>
            Figée
          </button>
          <button type="button" aria-pressed={linkMode === "mass_target"} onClick={() => setLinkMode("mass_target")}>
            Masse cible
          </button>
        </div>
        {linkMode === "mass_target" && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 13.5, color: "var(--soft)", flex: 1, display: "flex", alignItems: "center" }}>
                Masse de chaque recette (g)
              </span>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={targetMass}
                onChange={(e) => setTargetMass(e.target.value)}
                className="fl-input num"
                style={{ width: 110, textAlign: "right" }}
              />
            </label>
            <ExactToggle checked={forceExact} onChange={setForceExact} />
          </>
        )}
      </div>

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
      {result && (
        <p style={{ color: "var(--accent-2)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <Check size={15} />
          {result.added} recette{result.added > 1 ? "s" : ""} ajoutée{result.added > 1 ? "s" : ""}
          {result.skipped > 0 && ` · ${result.skipped} déjà présente${result.skipped > 1 ? "s" : ""}`}
        </p>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">
          {result ? "Fermer" : "Annuler"}
        </button>
        <button type="button" onClick={handleSubmit} disabled={pending || n === 0} className="fl-btn fl-btn-primary">
          {pending
            ? "Ajout…"
            : n === 0
              ? "Ajouter"
              : `Ajouter ${n} recette${n > 1 ? "s" : ""}${linkMode === "mass_target" ? ` à ${targetMass} g` : ""}`}
        </button>
      </div>
    </ModalOverlay>
  );
}
