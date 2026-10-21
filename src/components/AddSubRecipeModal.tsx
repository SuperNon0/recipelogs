"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Search } from "lucide-react";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { addSubRecipe } from "@/app/actions/subRecipes";
import { fetchAvailableRecipes, fetchRecipeIngredients } from "@/app/actions/modals";

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";
type Ing = { id: number; name: string; quantityG: number; unit: string };

export const SUB_MODE_HELP = {
  coefficient: "Coefficient : la recette d'origine est multipliée par ce nombre (1 = telle quelle, 0,5 = la moitié).",
  mass_target: "Masse cible : les quantités sont recalculées pour que la sous-recette pèse ce poids.",
  pivot_ingredient: "Ingrédient pivot : tu fixes la quantité d'un ingrédient, tous les autres suivent dans les mêmes proportions.",
} as const;

/** Fenêtre « Ajouter une sous-recette » (choix de la recette, du nom et de la quantité). */
export function AddSubRecipeDialog({ parentId, onClose }: { parentId: number; onClose: () => void }) {
  const [recipes, setRecipes] = useState<{ id: number; name: string }[] | null>(null);
  const [query, setQuery] = useState("");
  const [childId, setChildId] = useState<number | null>(null);
  const [label, setLabel] = useState("");
  const [calcMode, setCalcMode] = useState<Mode>("mass_target");
  const [calcValue, setCalcValue] = useState("500");
  const [childIngs, setChildIngs] = useState<Ing[] | null>(null);
  const [pivotId, setPivotId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAvailableRecipes(parentId).then(setRecipes);
  }, [parentId]);

  // Ingrédients de la recette choisie (pour le mode pivot).
  useEffect(() => {
    setChildIngs(null);
    setPivotId(null);
    if (!childId) return;
    fetchRecipeIngredients(childId).then((list) => {
      const usable = list.filter((i) => i.unit !== "QS" && i.quantityG > 0);
      setChildIngs(usable);
      setPivotId(usable[0]?.id ?? null);
    });
  }, [childId]);

  const filtered = useMemo(() => {
    const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const q = n(query);
    return (recipes ?? []).filter((r) => n(r.name).includes(q)).slice(0, 80);
  }, [recipes, query]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!childId) return setError("Choisis la recette à utiliser.");
    if (!label.trim()) return setError("Donne un nom à la sous-recette (ex. Mousse, Biscuit, Glaçage).");
    if (calcMode === "pivot_ingredient" && !pivotId) return setError("Choisis l'ingrédient pivot.");
    const fd = new FormData();
    fd.set("childId", String(childId));
    fd.set("label", label.trim());
    fd.set("calcMode", calcMode);
    fd.set("calcValue", calcValue.replace(",", "."));
    if (calcMode === "pivot_ingredient" && pivotId) fd.set("pivotIngredientId", String(pivotId));
    setSubmitting(true);
    const res = await addSubRecipe(parentId, fd);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Layers size={18} style={{ color: "var(--accent)" }} /> Ajouter une sous-recette
          <Help title="Sous-recette">
            Une sous-recette est une autre de tes recettes utilisée comme élément de celle-ci
            (biscuit, mousse, glaçage…). Elle reste liée : si tu modifies la recette d&apos;origine,
            la sous-recette suit. Tu choisis la quantité à utiliser.
          </Help>
        </span>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Recette à utiliser</span>
          <label className="searchbox">
            <Search size={16} />
            <input placeholder="Rechercher une recette…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          </label>
          <div className="fl-scroll" style={{ maxHeight: 220, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg)" }}>
            {recipes === null ? (
              <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Chargement…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 12, color: "var(--muted)", fontSize: 13 }}>Aucune recette trouvée.</div>
            ) : (
              filtered.map((r) => (
                <button
                  type="button"
                  key={r.id}
                  className="pdf-theme-opt"
                  aria-pressed={childId === r.id}
                  style={{ margin: 0, borderRadius: 0, borderBottom: "1px solid var(--border)" }}
                  onClick={() => {
                    setChildId(r.id);
                    if (!label || recipes?.some((x) => x.name === label)) setLabel(r.name);
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13.5 }}>{r.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom dans cette recette</span>
          <input className="fl-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Biscuit, Mousse, Glaçage" maxLength={200} />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
            Quantité
            <Help title="Comment régler la quantité">
              {SUB_MODE_HELP.coefficient}
              <br />
              <br />
              {SUB_MODE_HELP.mass_target}
              <br />
              <br />
              {SUB_MODE_HELP.pivot_ingredient}
            </Help>
          </span>
          <div className="fl-seg" style={{ alignSelf: "flex-start" }}>
            {(["mass_target", "coefficient", "pivot_ingredient"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={calcMode === m} onClick={() => setCalcMode(m)}>
                {m === "mass_target" ? "Masse cible" : m === "coefficient" ? "Coefficient" : "Pivot"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {calcMode === "pivot_ingredient" && (
              <select
                className="fl-input"
                style={{ flex: "2 1 200px" }}
                value={pivotId ?? ""}
                onChange={(e) => setPivotId(Number(e.target.value))}
                disabled={!childIngs || childIngs.length === 0}
                aria-label="Ingrédient pivot"
              >
                {!childId && <option value="">Choisis d&apos;abord une recette</option>}
                {childIngs?.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.quantityG.toLocaleString("fr-FR")} {i.unit})
                  </option>
                ))}
              </select>
            )}
            <div style={{ position: "relative", flex: "1 1 120px" }}>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                className="fl-input"
                value={calcValue}
                onChange={(e) => setCalcValue(e.target.value)}
                required
                style={{ paddingRight: 34 }}
                aria-label="Valeur"
              />
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: 13 }}>
                {calcMode === "coefficient" ? "×" : "g"}
              </span>
            </div>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 12.5 }}>{SUB_MODE_HELP[calcMode]}</p>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Annuler</button>
          <button type="submit" disabled={submitting} className="fl-btn fl-btn-primary">
            {submitting ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
