"use client";

import { foldText } from "@/lib/textSearch";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Layers, Plus, Search } from "lucide-react";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { addSubRecipe } from "@/app/actions/subRecipes";
import { fetchAvailableRecipes, fetchRecipeIngredients } from "@/app/actions/modals";
import { createRecipeInline, type PendingSubRecipe } from "@/app/actions/recipes";
import { parseIngredientsText } from "@/lib/parseIngredientsText";
import { formatG } from "@/lib/format";
import { recipeMass } from "@/lib/massAdjust";

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";
type Ing = { id: number; name: string; quantityG: number; unit: string };

export const SUB_MODE_HELP = {
  coefficient: "Coefficient : la recette d'origine est multipliée par ce nombre (1 = telle quelle, 0,5 = la moitié).",
  mass_target: "Masse cible : les quantités sont recalculées pour que la sous-recette pèse ce poids.",
  pivot_ingredient: "Ingrédient pivot : tu fixes la quantité d'un ingrédient, tous les autres suivent dans les mêmes proportions.",
} as const;

/** Sous-recette choisie dans le formulaire d'une recette, pas encore enregistrée. */
export type PickedSubRecipe = PendingSubRecipe & { childName: string; pivotName?: string };

/**
 * Fenêtre « Ajouter une sous-recette » (choix de la recette, du nom et de la quantité).
 * - Sur la fiche (`parentId`) : la sous-recette est ajoutée tout de suite.
 * - Dans le formulaire (`onPicked`) : elle est rendue au formulaire, qui l'ajoute
 *   en enregistrant la recette.
 * « Nouvelle recette » permet de créer la recette à utiliser sans quitter la fenêtre.
 */
export function AddSubRecipeDialog({
  parentId,
  onClose,
  onPicked,
  startWithNew = false,
  newDefaults,
}: {
  parentId?: number;
  onClose: () => void;
  onPicked?: (p: PickedSubRecipe) => void;
  /** Ouvre directement sur « Nouvelle recette ». */
  startWithNew?: boolean;
  /** Dossier et catégories donnés à une recette créée ici (ceux de la recette en cours). */
  newDefaults?: { folderId?: number | null; categoryIds?: number[] };
}) {
  const [creating, setCreating] = useState(startWithNew);
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
    fetchAvailableRecipes(parentId ?? 0).then(setRecipes);
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
    const n = foldText;
    const q = n(query);
    return (recipes ?? []).filter((r) => n(r.name).includes(q)).slice(0, 80);
  }, [recipes, query]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
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
    if (onPicked) {
      const value = Number(calcValue.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) return setError("La quantité doit être un nombre positif.");
      onPicked({
        childId,
        childName: recipes?.find((r) => r.id === childId)?.name ?? label.trim(),
        label: label.trim(),
        calcMode,
        calcValue: value,
        pivotIngredientId: calcMode === "pivot_ingredient" ? pivotId : null,
        pivotName: calcMode === "pivot_ingredient" ? childIngs?.find((i) => i.id === pivotId)?.name : undefined,
      });
      onClose();
      return;
    }
    if (!parentId) return;
    setSubmitting(true);
    const res = await addSubRecipe(parentId, fd);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  const titleHelp = (
    <Help title="Sous-recette">
      Une sous-recette est une autre de tes recettes utilisée comme élément de celle-ci
      (biscuit, mousse, glaçage…). Elle reste liée : si tu modifies la recette d&apos;origine,
      la sous-recette suit. Tu choisis la quantité à utiliser. Si elle n&apos;existe pas encore,
      « Nouvelle recette » la crée sans quitter cette fenêtre.
    </Help>
  );

  if (creating) {
    return (
      <ModalOverlay
        onClose={onClose}
        title={
          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Layers size={18} style={{ color: "var(--accent)" }} /> Nouvelle sous-recette
            <Help title="Nouvelle sous-recette">
              Écris ici la recette de l&apos;élément (biscuit, crème, glaçage…). Elle est enregistrée
              comme une recette à part entière, dans le même dossier et les mêmes catégories que
              la recette en cours, puis choisie comme sous-recette. Tu pourras la compléter plus
              tard depuis sa fiche.
            </Help>
          </span>
        }
      >
        <QuickRecipeForm
          defaults={newDefaults}
          onCancel={() => setCreating(false)}
          onCreated={(r) => {
            setRecipes((list) => [...(list ?? []), r].sort((a, b) => a.name.localeCompare(b.name, "fr")));
            setChildId(r.id);
            setLabel(r.name);
            setQuery("");
            // Une recette écrite pour l'occasion s'utilise en général telle quelle.
            setCalcMode("coefficient");
            setCalcValue("1");
            setCreating(false);
          }}
        />
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Layers size={18} style={{ color: "var(--accent)" }} /> Ajouter une sous-recette
          {titleHelp}
        </span>
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Recette à utiliser</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label className="searchbox" style={{ flex: 1, minWidth: 0 }}>
              <Search size={16} />
              <input placeholder="Rechercher une recette…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <button type="button" className="fl-btn fl-btn-secondary" style={{ flex: "none" }} onClick={() => setCreating(true)}>
              <Plus size={16} /> Nouvelle recette
            </button>
          </div>
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
            {submitting ? "Ajout…" : onPicked ? "Ajouter à la recette" : "Ajouter"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

/**
 * Petite fenêtre d'écriture d'une recette (nom, ingrédients en texte, étapes),
 * pour créer une sous-recette sans quitter la recette en cours.
 */
function QuickRecipeForm({
  defaults,
  onCancel,
  onCreated,
}: {
  defaults?: { folderId?: number | null; categoryIds?: number[] };
  onCancel: () => void;
  onCreated: (r: { id: number; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [steps, setSteps] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => parseIngredientsText(text), [text]);
  const mass = recipeMass(parsed.map((p) => ({ quantityG: p.quantityG, quantityGMax: p.quantityGMax ?? null, unit: p.unit })));

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    if (!name.trim()) return setError("Donne un nom à la recette (ex. Biscuit cuillère).");
    if (parsed.filter((p) => p.unit !== "titre").length === 0) return setError("Écris au moins un ingrédient, un par ligne (ex. 200 g farine).");
    const fd = new FormData();
    fd.set("name", name.trim());
    fd.set("steps", steps);
    if (defaults?.folderId) fd.set("folderId", String(defaults.folderId));
    for (const c of defaults?.categoryIds ?? []) fd.append("categoryIds", String(c));
    for (const p of parsed) {
      fd.append("ingredientName", p.name);
      fd.append("ingredientQty", p.unit === "QS" ? "0" : String(p.quantityG));
      fd.append("ingredientQtyMax", p.quantityGMax != null ? String(p.quantityGMax) : "");
      fd.append("ingredientUnit", p.unit);
    }
    setSaving(true);
    try {
      const res = await createRecipeInline(fd);
      if (res.ok) onCreated({ id: res.id, name: res.name });
      else setError(res.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button type="button" className="fl-btn fl-btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 4 }} onClick={onCancel}>
        <ChevronLeft size={16} /> Choisir une recette existante
      </button>
      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label">Nom de la recette</span>
        <input className="fl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Biscuit joconde, Crémeux citron" maxLength={200} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
          Ingrédients
          <Help
            title="Ingrédients"
            example={<span style={{ whiteSpace: "pre-line", fontFamily: "var(--font-mono)", fontSize: 12 }}>{"200g farine\n100-120g sucre\n2 cs huile\n3 oeufs"}</span>}
          >
            Un ingrédient par ligne, comme dans la « Saisie en lot » : les quantités, unités (g, kg,
            ml, cc, cs, pièces) et fourchettes sont reconnues. La liste lue s&apos;affiche dessous pour
            vérifier.
          </Help>
        </span>
        <textarea
          className="fl-input"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Un ingrédient par ligne :\n\n200g farine\n100g beurre\n3 oeufs"}
        />
      </label>
      {parsed.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px", fontSize: 13, background: "var(--bg)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12, marginBottom: 4 }}>
            <span>{parsed.length} ligne{parsed.length > 1 ? "s" : ""} lue{parsed.length > 1 ? "s" : ""}</span>
            <span>Masse totale <b className="num">{formatG(mass.avg)}</b></span>
          </div>
          {parsed.map((p, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
              <span style={{ fontWeight: p.unit === "titre" ? 600 : 400, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span className="num" style={{ color: "var(--soft)", flex: "none" }}>
                {p.unit === "titre"
                  ? ""
                  : p.unit === "QS"
                    ? "QS"
                    : `${p.quantityG.toLocaleString("fr-FR")}${p.quantityGMax != null ? `–${p.quantityGMax.toLocaleString("fr-FR")}` : ""} ${p.unit}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        <span className="fl-label">Préparation (facultatif)</span>
        <textarea className="fl-input" rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Une étape par ligne" />
      </label>

      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onCancel} className="fl-btn fl-btn-secondary">Retour</button>
        <button type="submit" disabled={saving} className="fl-btn fl-btn-primary">
          {saving ? "Création…" : "Créer et continuer"}
        </button>
      </div>
    </form>
  );
}
