"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatCoef, formatG } from "@/lib/format";
import { computeLocalCoef } from "@/lib/subRecipes";
import {
  removeSubRecipe,
  toggleSubRecipeLock,
  updateSubRecipe,
} from "@/app/actions/subRecipes";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type IngredientRow = {
  id: number;
  name: string;
  quantityG: number;
};

export type SubRecipeRow = {
  id: number;
  childId: number;
  childName: string;
  label: string;
  calcMode: "coefficient" | "mass_target" | "pivot_ingredient";
  calcValue: number;
  pivotIngredientId: number | null;
  isLocked: boolean;
  childIngredients: IngredientRow[];
  childSteps: string | null;
};

type Mode = "coefficient" | "mass_target" | "pivot_ingredient";

// ─────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────

export function RecipeBody({
  recipeId,
  ingredients,
  subRecipes,
}: {
  recipeId: number;
  ingredients: IngredientRow[];
  subRecipes: SubRecipeRow[];
}) {
  const baseTotalG = useMemo(
    () => ingredients.reduce((s, i) => s + i.quantityG, 0),
    [ingredients],
  );

  const [mode, setMode] = useState<Mode>("coefficient");
  const [coefInput, setCoefInput] = useState("1");
  const [massInput, setMassInput] = useState(
    String(Math.round(baseTotalG)),
  );
  const [pivotId, setPivotId] = useState<number | null>(
    ingredients[0]?.id ?? null,
  );
  const [pivotInput, setPivotInput] = useState(
    ingredients[0]?.quantityG ? String(ingredients[0].quantityG) : "0",
  );

  const globalCoef = useMemo(() => {
    if (mode === "coefficient") {
      const v = Number(coefInput);
      return Number.isFinite(v) && v > 0 ? v : 1;
    }
    if (mode === "mass_target") {
      const target = Number(massInput);
      if (!Number.isFinite(target) || target <= 0 || baseTotalG <= 0) return 1;
      return target / baseTotalG;
    }
    // pivot
    const pivot = ingredients.find((i) => i.id === pivotId);
    const target = Number(pivotInput);
    if (!pivot || !Number.isFinite(target) || target <= 0) return 1;
    if (pivot.quantityG <= 0) return 1;
    return target / pivot.quantityG;
  }, [mode, coefInput, massInput, pivotId, pivotInput, ingredients, baseTotalG]);

  const reset = () => {
    setMode("coefficient");
    setCoefInput("1");
    setMassInput(String(Math.round(baseTotalG)));
    if (ingredients[0]) {
      setPivotId(ingredients[0].id);
      setPivotInput(String(ingredients[0].quantityG));
    }
  };

  const effectiveTotalG = baseTotalG * globalCoef;

  return (
    <div className="flex flex-col gap-5">
      <MultiplierPanel
        mode={mode}
        setMode={setMode}
        coefInput={coefInput}
        setCoefInput={setCoefInput}
        massInput={massInput}
        setMassInput={setMassInput}
        pivotId={pivotId}
        setPivotId={setPivotId}
        pivotInput={pivotInput}
        setPivotInput={setPivotInput}
        ingredients={ingredients}
        globalCoef={globalCoef}
        effectiveTotalG={effectiveTotalG}
        onReset={reset}
      />

      <IngredientsTable
        ingredients={ingredients}
        coef={globalCoef}
        totalG={effectiveTotalG}
      />

      {subRecipes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>
            Sous-recettes
          </h2>
          {subRecipes.map((sr) => (
            <SubRecipeAccordion
              key={sr.id}
              parentId={recipeId}
              subRecipe={sr}
              globalCoef={globalCoef}
            />
          ))}
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Multiplier panel
// ─────────────────────────────────────────────

function MultiplierPanel({
  mode,
  setMode,
  coefInput,
  setCoefInput,
  massInput,
  setMassInput,
  pivotId,
  setPivotId,
  pivotInput,
  setPivotInput,
  ingredients,
  globalCoef,
  effectiveTotalG,
  onReset,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  coefInput: string;
  setCoefInput: (v: string) => void;
  massInput: string;
  setMassInput: (v: string) => void;
  pivotId: number | null;
  setPivotId: (v: number) => void;
  pivotInput: string;
  setPivotInput: (v: string) => void;
  ingredients: IngredientRow[];
  globalCoef: number;
  effectiveTotalG: number;
  onReset: () => void;
}) {
  return (
    <section className="fl-card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="fl-title-serif" style={{ fontSize: "1.15rem" }}>
          Multiplicateur
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="fl-btn fl-btn-secondary"
          style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
        >
          Réinitialiser
        </button>
      </div>

      <ModeSwitcher mode={mode} setMode={setMode} />

      {mode === "coefficient" && (
        <Field label="Coefficient (×)">
          <input
            type="number"
            step="0.01"
            min="0"
            className="fl-input"
            value={coefInput}
            onChange={(e) => setCoefInput(e.target.value)}
          />
        </Field>
      )}

      {mode === "mass_target" && (
        <Field label="Masse totale cible (g)">
          <input
            type="number"
            step="1"
            min="0"
            className="fl-input"
            value={massInput}
            onChange={(e) => setMassInput(e.target.value)}
          />
        </Field>
      )}

      {mode === "pivot_ingredient" && (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Field label="Ingrédient pivot">
            <select
              className="fl-input"
              value={pivotId ?? ""}
              onChange={(e) => setPivotId(Number(e.target.value))}
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantité cible (g)">
            <input
              type="number"
              step="0.01"
              min="0"
              className="fl-input"
              value={pivotInput}
              onChange={(e) => setPivotInput(e.target.value)}
            />
          </Field>
        </div>
      )}

      <div className="flex items-end justify-between pt-2 border-t border-[color:var(--border)]">
        <div>
          <div className="fl-label">Coefficient effectif</div>
          <div
            className="fl-value-serif"
            style={{ fontSize: "1.4rem", color: "var(--accent-2)" }}
          >
            {formatCoef(globalCoef)}
          </div>
        </div>
        <div className="text-right">
          <div className="fl-label">Masse totale</div>
          <div className="fl-value-serif" style={{ fontSize: "2rem" }}>
            {formatG(effectiveTotalG)}
          </div>
        </div>
      </div>
    </section>
  );
}

function ModeSwitcher({
  mode,
  setMode,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
}) {
  const items: { key: Mode; label: string }[] = [
    { key: "coefficient", label: "Coefficient" },
    { key: "mass_target", label: "Masse totale" },
    { key: "pivot_ingredient", label: "Pivot" },
  ];
  return (
    <div
      className="grid grid-cols-3 gap-1 p-1 rounded-lg"
      style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
    >
      {items.map((i) => {
        const active = mode === i.key;
        return (
          <button
            key={i.key}
            type="button"
            onClick={() => setMode(i.key)}
            className="fl-nav-item"
            style={{
              textAlign: "center",
              padding: "0.55rem 0.5rem",
              borderRadius: 6,
              borderBottom: "none",
              background: active
                ? "rgba(232, 197, 71, 0.1)"
                : "transparent",
              color: active ? "var(--accent)" : "var(--muted)",
            }}
          >
            {i.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 flex-1">
      <span className="fl-label">{label}</span>
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────
// Ingredient table
// ─────────────────────────────────────────────

function IngredientsTable({
  ingredients,
  coef,
  totalG,
}: {
  ingredients: IngredientRow[];
  coef: number;
  totalG: number;
}) {
  return (
    <section className="fl-card">
      <h2 className="fl-title-serif mb-3" style={{ fontSize: "1.1rem" }}>
        Ingrédients
      </h2>
      <table className="w-full">
        <tbody>
          {ingredients.map((ing, idx) => (
            <tr
              key={ing.id}
              style={{
                background:
                  idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              }}
            >
              <td
                className="py-1.5 pr-3 text-right"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.9rem",
                  width: 130,
                }}
              >
                {(ing.quantityG * coef).toLocaleString("fr-FR", {
                  maximumFractionDigits: 2,
                })}{" "}
                <span style={{ color: "var(--muted)" }}>g</span>
              </td>
              <td className="py-1.5">{ing.name}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td
              className="pt-3 text-right fl-value-serif"
              style={{ fontSize: "1.1rem" }}
            >
              {formatG(totalG)}
            </td>
            <td className="pt-3 fl-label">Total</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

// ─────────────────────────────────────────────
// Sub-recipe accordion
// ─────────────────────────────────────────────

function SubRecipeAccordion({
  parentId,
  subRecipe,
  globalCoef,
}: {
  parentId: number;
  subRecipe: SubRecipeRow;
  globalCoef: number;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  const childBaseTotalG = subRecipe.childIngredients.reduce(
    (s, i) => s + i.quantityG,
    0,
  );

  const pivotBaseQty = subRecipe.pivotIngredientId
    ? subRecipe.childIngredients.find(
        (i) => i.id === subRecipe.pivotIngredientId,
      )?.quantityG ?? null
    : null;

  const localCoef = computeLocalCoef(
    subRecipe.calcMode,
    subRecipe.calcValue,
    childBaseTotalG,
    pivotBaseQty,
  );

  const effectiveCoef = subRecipe.isLocked
    ? localCoef
    : localCoef * globalCoef;

  const effectiveTotalG = childBaseTotalG * effectiveCoef;

  return (
    <div
      className="fl-card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: subRecipe.isLocked
          ? "rgba(167, 139, 250, 0.5)"
          : "var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: "transparent" }}
      >
        <span
          style={{
            color: "var(--muted)",
            fontSize: "1.1rem",
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 120ms ease",
          }}
        >
          ›
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className="fl-title-serif"
              style={{ fontSize: "1rem" }}
            >
              {subRecipe.label}
            </span>
            <span className="fl-label truncate">
              {subRecipe.childName}
            </span>
          </div>
          <div className="flex gap-3 mt-0.5 text-[0.7rem] text-[color:var(--muted)]">
            <span>{formatG(effectiveTotalG)}</span>
            <span>{formatCoef(effectiveCoef)}</span>
          </div>
        </div>
        {subRecipe.isLocked && (
          <span
            className="fl-tag"
            style={{
              background: "rgba(167, 139, 250, 0.15)",
              color: "var(--pending)",
              borderColor: "rgba(167, 139, 250, 0.4)",
            }}
          >
            🔒 Verrouillé
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[color:var(--border)]">
          <div className="flex flex-wrap gap-2 pt-3">
            <Link
              href={`/recipes/${subRecipe.childId}`}
              className="fl-btn fl-btn-secondary"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              🔗 Voir la fiche
            </Link>
            <button
              type="button"
              onClick={() =>
                startTransition(() =>
                  toggleSubRecipeLock(subRecipe.id, parentId),
                )
              }
              className={
                subRecipe.isLocked ? "fl-btn fl-btn-pending" : "fl-btn fl-btn-secondary"
              }
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              {subRecipe.isLocked ? "🔓 Déverrouiller" : "🔒 Verrouiller"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="fl-btn fl-btn-edit"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              ✎ Ajuster
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(`Retirer la sous-recette « ${subRecipe.label} » ?`)) {
                  startTransition(() =>
                    removeSubRecipe(subRecipe.id, parentId),
                  );
                }
              }}
              className="fl-btn fl-btn-danger"
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              Retirer
            </button>
          </div>

          <table className="w-full">
            <tbody>
              {subRecipe.childIngredients.map((ing, idx) => (
                <tr
                  key={ing.id}
                  style={{
                    background:
                      idx % 2 === 0
                        ? "transparent"
                        : "rgba(255,255,255,0.015)",
                  }}
                >
                  <td
                    className="py-1 pr-3 text-right"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.85rem",
                      width: 120,
                    }}
                  >
                    {(ing.quantityG * effectiveCoef).toLocaleString("fr-FR", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    <span style={{ color: "var(--muted)" }}>g</span>
                  </td>
                  <td className="py-1">{ing.name}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  className="pt-2 text-right fl-value-serif"
                  style={{ fontSize: "0.95rem" }}
                >
                  {formatG(effectiveTotalG)}
                </td>
                <td className="pt-2 fl-label">Total</td>
              </tr>
            </tfoot>
          </table>

          {subRecipe.childSteps && (
            <details className="pt-2">
              <summary
                className="fl-label cursor-pointer"
                style={{ marginBottom: 8 }}
              >
                Étapes
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.82rem",
                  lineHeight: 1.6,
                  color: "var(--text)",
                }}
              >
                {subRecipe.childSteps}
              </pre>
            </details>
          )}
        </div>
      )}

      {editing && (
        <EditSubRecipeModal
          subRecipe={subRecipe}
          parentId={parentId}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Edit sub-recipe modal
// ─────────────────────────────────────────────

function EditSubRecipeModal({
  subRecipe,
  parentId,
  onClose,
}: {
  subRecipe: SubRecipeRow;
  parentId: number;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(subRecipe.label);
  const [calcMode, setCalcMode] = useState<Mode>(subRecipe.calcMode);
  const [calcValue, setCalcValue] = useState(String(subRecipe.calcValue));
  const [pivotId, setPivotId] = useState<number | null>(
    subRecipe.pivotIngredientId,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const fd = new FormData();
    fd.set("label", label);
    fd.set("calcMode", calcMode);
    fd.set("calcValue", calcValue);
    if (calcMode === "pivot_ingredient" && pivotId) {
      fd.set("pivotIngredientId", String(pivotId));
    }
    const res = await updateSubRecipe(subRecipe.id, parentId, fd);
    setSubmitting(false);
    if (res.ok) onClose();
    else setError(res.error);
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h3 className="fl-title-serif" style={{ fontSize: "1.15rem" }}>
          Ajuster {subRecipe.label}
        </h3>

        <Field label="Label">
          <input
            className="fl-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            required
          />
        </Field>

        <Field label="Mode de calcul">
          <select
            className="fl-input"
            value={calcMode}
            onChange={(e) => setCalcMode(e.target.value as Mode)}
          >
            <option value="coefficient">Coefficient (×)</option>
            <option value="mass_target">Masse totale cible (g)</option>
            <option value="pivot_ingredient">Ingrédient pivot (g)</option>
          </select>
        </Field>

        <Field label="Valeur">
          <input
            type="number"
            step="0.01"
            min="0"
            className="fl-input"
            value={calcValue}
            onChange={(e) => setCalcValue(e.target.value)}
            required
          />
        </Field>

        {calcMode === "pivot_ingredient" && (
          <Field label="Ingrédient pivot">
            <select
              className="fl-input"
              value={pivotId ?? ""}
              onChange={(e) => setPivotId(Number(e.target.value))}
            >
              <option value="">—</option>
              {subRecipe.childIngredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {error && (
          <div
            className="fl-card"
            style={{
              background: "rgba(232, 92, 71, 0.08)",
              borderColor: "rgba(232, 92, 71, 0.4)",
              color: "var(--danger)",
              padding: "0.6rem 0.8rem",
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="fl-btn fl-btn-primary"
          >
            {submitting ? "…" : "Enregistrer"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="fl-btn fl-btn-secondary"
          >
            Annuler
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

export function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(0, 0, 0, 0.8)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg p-5 flex flex-col gap-3 fl-scroll"
        style={{
          background: "var(--card)",
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            width: 32,
            height: 4,
            background: "var(--border)",
            borderRadius: 2,
            alignSelf: "center",
          }}
        />
        {children}
      </div>
    </div>
  );
}
