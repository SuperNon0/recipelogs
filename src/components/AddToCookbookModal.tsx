"use client";

import { useMemo, useState, useTransition } from "react";
import { addRecipeToCookbook } from "@/app/actions/cookbooks";
import { ModalOverlay } from "./RecipeBody";

type Cookbook = { id: number; name: string };
type Ingredient = { name: string; quantityG: number };
type CalcMode = "coefficient" | "mass" | "pivot";

export function AddToCookbookButton({
  recipeId,
  cookbooks,
  totalMassG,
  ingredients,
}: {
  recipeId: number;
  cookbooks: Cookbook[];
  totalMassG: number;
  ingredients: Ingredient[];
}) {
  const [open, setOpen] = useState(false);

  if (cookbooks.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.8rem" }}
      >
        📒 Ajouter au cahier
      </button>
      {open && (
        <AddToCookbookModal
          recipeId={recipeId}
          cookbooks={cookbooks}
          totalMassG={totalMassG}
          ingredients={ingredients}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddToCookbookModal({
  recipeId,
  cookbooks,
  totalMassG,
  ingredients,
  onClose,
}: {
  recipeId: number;
  cookbooks: Cookbook[];
  totalMassG: number;
  ingredients: Ingredient[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [cookbookId, setCookbookId] = useState(cookbooks[0]?.id ?? 0);
  const [linkMode, setLinkMode] = useState<"linked" | "snapshot">("linked");
  const [subrecipeMode, setSubrecipeMode] = useState<"single" | "separate">("single");
  const [error, setError] = useState<string | null>(null);

  // Multiplication (uniquement utilisée en mode snapshot/figée)
  const [calcMode, setCalcMode] = useState<CalcMode>("coefficient");
  const [coefStr, setCoefStr] = useState("1");
  const [targetMassStr, setTargetMassStr] = useState(String(Math.round(totalMassG)));
  const [pivotIdx, setPivotIdx] = useState(0);
  const [pivotValueStr, setPivotValueStr] = useState(
    String(ingredients[0]?.quantityG ?? 0),
  );

  const multiplier = useMemo(() => {
    if (linkMode !== "snapshot") return 1;
    if (calcMode === "coefficient") {
      const k = parseFloat(coefStr.replace(",", "."));
      return isFinite(k) && k > 0 ? k : 1;
    }
    if (calcMode === "mass") {
      const target = parseFloat(targetMassStr.replace(",", "."));
      if (!isFinite(target) || target <= 0 || totalMassG <= 0) return 1;
      return target / totalMassG;
    }
    // pivot
    const ref = ingredients[pivotIdx]?.quantityG ?? 0;
    const target = parseFloat(pivotValueStr.replace(",", "."));
    if (!isFinite(target) || target <= 0 || ref <= 0) return 1;
    return target / ref;
  }, [linkMode, calcMode, coefStr, targetMassStr, pivotValueStr, pivotIdx, ingredients, totalMassG]);

  const previewMass = totalMassG * multiplier;

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addRecipeToCookbook(
        cookbookId,
        recipeId,
        linkMode,
        subrecipeMode,
        multiplier,
      );
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-5" style={{ minWidth: 320 }}>
        <h2 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>
          Ajouter au cahier
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Cahier</span>
          <select
            value={cookbookId}
            onChange={(e) => setCookbookId(Number(e.target.value))}
            className="fl-input"
          >
            {cookbooks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Mode de liaison</span>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="linkMode"
                value="linked"
                checked={linkMode === "linked"}
                onChange={() => setLinkMode("linked")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm">🔗 Liée</div>
                <div className="fl-label" style={{ fontWeight: 400 }}>
                  Toujours à jour avec la recette courante
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="linkMode"
                value="snapshot"
                checked={linkMode === "snapshot"}
                onChange={() => setLinkMode("snapshot")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm">📌 Figée</div>
                <div className="fl-label" style={{ fontWeight: 400 }}>
                  Capture la recette (avec multiplication possible)
                </div>
              </div>
            </label>
          </div>
        </div>

        {linkMode === "snapshot" && (
          <div
            className="fl-card flex flex-col gap-3"
            style={{ padding: "0.9rem" }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="fl-label">Multiplication (optionnel)</span>
              <span className="fl-label" style={{ color: "var(--accent)", fontWeight: 600 }}>
                {Math.round(previewMass)} g (×{multiplier.toFixed(3)})
              </span>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setCalcMode("coefficient")}
                className={`fl-btn ${calcMode === "coefficient" ? "fl-btn-primary" : "fl-btn-secondary"}`}
                style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              >
                × Coefficient
              </button>
              <button
                type="button"
                onClick={() => setCalcMode("mass")}
                className={`fl-btn ${calcMode === "mass" ? "fl-btn-primary" : "fl-btn-secondary"}`}
                style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              >
                ⚖ Masse cible
              </button>
              <button
                type="button"
                onClick={() => setCalcMode("pivot")}
                className={`fl-btn ${calcMode === "pivot" ? "fl-btn-primary" : "fl-btn-secondary"}`}
                style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                disabled={ingredients.length === 0}
              >
                🎯 Pivot
              </button>
            </div>

            {calcMode === "coefficient" && (
              <label className="flex items-center gap-2">
                <span className="fl-label" style={{ minWidth: 90 }}>Coefficient</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={coefStr}
                  onChange={(e) => setCoefStr(e.target.value)}
                  className="fl-input"
                  style={{ width: 120 }}
                />
              </label>
            )}

            {calcMode === "mass" && (
              <label className="flex items-center gap-2">
                <span className="fl-label" style={{ minWidth: 90 }}>Masse (g)</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={targetMassStr}
                  onChange={(e) => setTargetMassStr(e.target.value)}
                  className="fl-input"
                  style={{ width: 120 }}
                />
                <span className="fl-label" style={{ fontWeight: 400, color: "var(--muted)" }}>
                  (actuel : {Math.round(totalMassG)} g)
                </span>
              </label>
            )}

            {calcMode === "pivot" && ingredients.length > 0 && (
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2">
                  <span className="fl-label" style={{ minWidth: 90 }}>Ingrédient</span>
                  <select
                    value={pivotIdx}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setPivotIdx(i);
                      setPivotValueStr(String(ingredients[i]?.quantityG ?? 0));
                    }}
                    className="fl-input flex-1"
                  >
                    {ingredients.map((ing, i) => (
                      <option key={i} value={i}>
                        {ing.name} ({Math.round(ing.quantityG)} g)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="fl-label" style={{ minWidth: 90 }}>Quantité (g)</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pivotValueStr}
                    onChange={(e) => setPivotValueStr(e.target.value)}
                    className="fl-input"
                    style={{ width: 120 }}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Sous-recettes dans le PDF</span>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="subrecipeMode"
                value="single"
                checked={subrecipeMode === "single"}
                onChange={() => setSubrecipeMode("single")}
              />
              <span className="text-sm">📄 Fiche unique</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="subrecipeMode"
                value="separate"
                checked={subrecipeMode === "separate"}
                onChange={() => setSubrecipeMode("separate")}
              />
              <span className="text-sm">📚 Séparées</span>
            </label>
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleAdd}
            disabled={pending}
            className="fl-btn fl-btn-primary"
          >
            {pending ? "Ajout…" : "Ajouter"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="fl-btn fl-btn-secondary"
          >
            Annuler
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
