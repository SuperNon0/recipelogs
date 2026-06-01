"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { formatCoef, formatG } from "@/lib/format";
import { computeLocalCoef } from "@/lib/subRecipes";
import { adjustToTarget, ingMass } from "@/lib/massAdjust";
import {
  removeSubRecipe,
  toggleSubRecipeLock,
  updateSubRecipe,
} from "@/app/actions/subRecipes";
import { applyMultiplierToRecipe } from "@/app/actions/recipes";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type IngredientRow = {
  id: number;
  name: string;
  quantityG: number;
  quantityGMax?: number | null;
  unit?: string;
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
  isExact: boolean;
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
  const [baseTotalMinG, baseTotalMaxG] = useMemo(() => {
    let min = 0, max = 0;
    for (const i of ingredients) {
      const qMin = i.unit === "L" ? i.quantityG * 1000
        : i.quantityG * ((!i.unit || i.unit === "g") ? 1 : i.unit === "cc" ? 5 : i.unit === "cs" ? 15 : 0);
      const rawMax = i.quantityGMax != null ? i.quantityGMax : i.quantityG;
      const qMax = i.unit === "L" ? rawMax * 1000
        : rawMax * ((!i.unit || i.unit === "g") ? 1 : i.unit === "cc" ? 5 : i.unit === "cs" ? 15 : 0);
      min += qMin;
      max += qMax;
    }
    return [min, max];
  }, [ingredients]);
  const baseTotalG = (baseTotalMinG + baseTotalMaxG) / 2;

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
  const [forceExact, setForceExact] = useState(false);

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
    setForceExact(false);
    setMassInput(String(Math.round(baseTotalG)));
    if (ingredients[0]) {
      setPivotId(ingredients[0].id);
      setPivotInput(String(ingredients[0].quantityG));
    }
  };

  // Ingrédients scalés (Math.ceil, L→g)
  const scaledIngredients = useMemo<IngredientRow[]>(() => {
    return ingredients.map((ing) => {
      const unit = ing.unit ?? "g";
      if (unit === "L") {
        return {
          ...ing,
          quantityG: Math.ceil(ing.quantityG * globalCoef * 1000),
          quantityGMax: ing.quantityGMax != null ? Math.ceil(ing.quantityGMax * globalCoef * 1000) : null,
          unit: "g",
        };
      }
      return {
        ...ing,
        quantityG: Math.ceil(ing.quantityG * globalCoef),
        quantityGMax: ing.quantityGMax != null ? Math.ceil(ing.quantityGMax * globalCoef) : null,
      };
    });
  }, [ingredients, globalCoef]);

  // Quand forceExact est actif en mode masse totale : ajuste ±1g pour atteindre la masse exacte
  const displayIngredients = useMemo<IngredientRow[]>(() => {
    if (forceExact && mode === "mass_target") {
      const targetG = Number(massInput);
      if (targetG > 0) return adjustToTarget(scaledIngredients, targetG).ingredients;
    }
    return scaledIngredients;
  }, [scaledIngredients, forceExact, mode, massInput]);

  const [roundedTotalMin, roundedTotalMax] = useMemo(() => {
    const factor = (unit: string | undefined | null) =>
      (!unit || unit === "g") ? 1 : unit === "cc" ? 5 : unit === "cs" ? 15 : 0;
    let min = 0, max = 0;
    for (const ing of displayIngredients) {
      const f = factor(ing.unit);
      min += ing.quantityG * f;
      max += (ing.quantityGMax != null ? ing.quantityGMax : ing.quantityG) * f;
    }
    return [min, max];
  }, [displayIngredients]);
  const roundedTotalG = (roundedTotalMin + roundedTotalMax) / 2;

  return (
    <div className="flex flex-col gap-5">
      <MultiplierPanel
        recipeId={recipeId}
        hasSubRecipes={subRecipes.length > 0}
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
        effectiveTotalG={roundedTotalG}
        forceExact={forceExact}
        setForceExact={setForceExact}
        onReset={reset}
      />

      <IngredientsTable
        ingredients={displayIngredients}
        coef={1}
        totalMinG={roundedTotalMin}
        totalMaxG={roundedTotalMax}
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
  recipeId,
  hasSubRecipes,
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
  forceExact,
  setForceExact,
  onReset,
}: {
  recipeId: number;
  hasSubRecipes: boolean;
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
  forceExact: boolean;
  setForceExact: (v: boolean | ((prev: boolean) => boolean)) => void;
  onReset: () => void;
}) {
  const [savePending, startSaveTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = Math.abs(globalCoef - 1) > 1e-4 || (forceExact && mode === "mass_target");

  const handleApply = () => {
    if (!dirty) return;
    const msg = hasSubRecipes
      ? `Appliquer le coefficient ×${globalCoef.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} et écrire ces nouvelles quantités comme nouvelle base ?\n\nLes sous-recettes liées NE SERONT PAS modifiées.`
      : `Appliquer le coefficient ×${globalCoef.toLocaleString("fr-FR", { maximumFractionDigits: 3 })} et écrire ces nouvelles quantités comme nouvelle base ?`;
    if (!confirm(msg)) return;
    setSaveError(null);
    const targetG = forceExact && mode === "mass_target" ? Number(massInput) : undefined;
    startSaveTransition(async () => {
      const r = await applyMultiplierToRecipe(recipeId, globalCoef, targetG);
      if (!r.ok) {
        setSaveError(r.error);
        return;
      }
      onReset();
    });
  };

  return (
    <section className="fl-card flex flex-col gap-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="fl-title-serif" style={{ fontSize: "1.15rem" }}>
          Multiplicateur
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={savePending}
            className="fl-btn fl-btn-secondary"
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
          >
            Réinitialiser
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!dirty || savePending}
            className={dirty ? "fl-btn fl-btn-primary" : "fl-btn"}
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            title={
              dirty
                ? "Écrit les quantités affichées comme nouvelle base de la recette"
                : "Modifie d'abord le coefficient, la masse totale ou un pivot"
            }
          >
            {savePending ? "Mise à jour…" : "Mettre à jour la recette"}
          </button>
        </div>
      </div>
      {saveError && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {saveError}
        </p>
      )}

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
        <>
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
          <button
            type="button"
            onClick={() => setForceExact((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.5rem",
              padding: "0.4rem 0.75rem", borderRadius: 8,
              border: "1px solid",
              borderColor: forceExact ? "var(--accent)" : "var(--border)",
              background: forceExact ? "rgba(232,197,71,0.12)" : "transparent",
              color: forceExact ? "var(--accent)" : "var(--muted)",
              fontSize: "0.75rem", fontFamily: "var(--font-mono)",
              cursor: "pointer", fontWeight: forceExact ? 600 : 400,
            }}
          >
            <span>{forceExact ? "⚖️" : "≈"}</span>
            Masse exacte — ajuste ±1 g sur les plus gros ingrédients
          </button>
        </>
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
// Helpers — arrondi supérieur, jamais de virgule
// ─────────────────────────────────────────────

function scaledQty(qty: number, unit: string | undefined | null, coef: number): string {
  if (unit === "L") return Math.ceil(qty * coef * 1000).toLocaleString("fr-FR");
  return Math.ceil(qty * coef).toLocaleString("fr-FR");
}
function scaledUnit(unit: string | undefined | null): string {
  if (unit === "L") return "g";
  return unit ?? "g";
}

// ─────────────────────────────────────────────
// Ingredient table
// ─────────────────────────────────────────────

function IngredientsTable({
  ingredients,
  coef,
  totalMinG,
  totalMaxG,
}: {
  ingredients: IngredientRow[];
  coef: number;
  totalMinG: number;
  totalMaxG: number;
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
                  width: 150,
                }}
              >
                {ing.unit === "QS" ? (
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>QS</span>
                ) : ing.quantityGMax != null ? (
                  <span>
                    {scaledQty(ing.quantityG, ing.unit, coef)}
                    <span style={{ color: "var(--muted)" }}>/</span>
                    {scaledQty(ing.quantityGMax, ing.unit, coef)}
                    {" "}<span style={{ color: "var(--muted)" }}>{scaledUnit(ing.unit)}</span>
                    {(ing.unit === "cc" || ing.unit === "cs") && (
                      <span style={{ color: "var(--muted)", fontSize: "0.8em" }}>
                        {" "}(≈{formatG(((Math.ceil(ing.quantityG * coef) + Math.ceil(ing.quantityGMax * coef)) / 2) * (ing.unit === "cc" ? 5 : 15))})
                      </span>
                    )}
                  </span>
                ) : (ing.unit === "cc" || ing.unit === "cs") ? (
                  <>
                    {scaledQty(ing.quantityG, ing.unit, coef)}
                    {" "}<span style={{ color: "var(--muted)" }}>{ing.unit}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.75em" }}>
                      {" "}(≈{formatG(Math.ceil(ing.quantityG * coef) * (ing.unit === "cc" ? 5 : 15))})
                    </span>
                  </>
                ) : (
                  <>
                    {scaledQty(ing.quantityG, ing.unit, coef)}
                    {" "}<span style={{ color: "var(--muted)" }}>{scaledUnit(ing.unit)}</span>
                  </>
                )}
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
              {totalMinG !== totalMaxG ? (
                <>{formatG(totalMinG)}<span style={{ color: "var(--muted)" }}>/</span>{formatG(totalMaxG)}</>
              ) : formatG(totalMinG)}
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
  const [lockedOptimistic, setLockedOptimistic] = useState(subRecipe.isLocked);

  const [childBaseTotalMinG, childBaseTotalMaxG] = useMemo(() => {
    let min = 0, max = 0;
    for (const i of subRecipe.childIngredients) {
      const qMin = i.unit === "L" ? i.quantityG * 1000
        : i.quantityG * ((!i.unit || i.unit === "g") ? 1 : i.unit === "cc" ? 5 : i.unit === "cs" ? 15 : 0);
      const rawMax = i.quantityGMax != null ? i.quantityGMax : i.quantityG;
      const qMax = i.unit === "L" ? rawMax * 1000
        : rawMax * ((!i.unit || i.unit === "g") ? 1 : i.unit === "cc" ? 5 : i.unit === "cs" ? 15 : 0);
      min += qMin;
      max += qMax;
    }
    return [min, max];
  }, [subRecipe.childIngredients]);
  const childBaseTotalG = (childBaseTotalMinG + childBaseTotalMaxG) / 2;

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

  const effectiveCoef = lockedOptimistic
    ? localCoef
    : localCoef * globalCoef;

  const adjustedIngredients = useMemo(() => {
    const scaled = subRecipe.childIngredients.map((ing) => {
      const unit = ing.unit === "L" ? "g" : (ing.unit ?? "g");
      const qg = ing.unit === "L"
        ? Math.ceil(ing.quantityG * effectiveCoef * 1000)
        : Math.ceil(ing.quantityG * effectiveCoef);
      const qgMax = ing.quantityGMax != null
        ? (ing.unit === "L"
          ? Math.ceil(ing.quantityGMax * effectiveCoef * 1000)
          : Math.ceil(ing.quantityGMax * effectiveCoef))
        : null;
      return { name: ing.name, quantityG: qg, quantityGMax: qgMax, unit };
    });
    if (subRecipe.isExact && subRecipe.calcMode === "mass_target") {
      const target = Math.round(subRecipe.calcValue * (lockedOptimistic ? 1 : globalCoef));
      return adjustToTarget(scaled, target).ingredients;
    }
    return scaled;
  }, [subRecipe.childIngredients, subRecipe.isExact, subRecipe.calcMode, subRecipe.calcValue, effectiveCoef, lockedOptimistic, globalCoef]);

  const [roundedChildMin, roundedChildMax] = useMemo(() => {
    const min = adjustedIngredients.reduce((s, i) => s + ingMass(i.quantityG, i.unit), 0);
    const max = adjustedIngredients.reduce(
      (s, i) => s + ingMass(i.quantityGMax != null ? i.quantityGMax : i.quantityG, i.unit), 0,
    );
    return [min, max];
  }, [adjustedIngredients]);

  return (
    <div
      className="fl-card"
      style={{
        padding: 0,
        overflow: "hidden",
        borderColor: lockedOptimistic
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
            <span>{roundedChildMin !== roundedChildMax
              ? `${formatG(roundedChildMin)}/${formatG(roundedChildMax)}`
              : formatG(roundedChildMin)}</span>
            <span>{formatCoef(effectiveCoef)}</span>
          </div>
        </div>
        {lockedOptimistic && (
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
              onClick={() => {
                const next = !lockedOptimistic;
                setLockedOptimistic(next);
                startTransition(() => toggleSubRecipeLock(subRecipe.id, parentId));
              }}
              className={
                lockedOptimistic ? "fl-btn fl-btn-pending" : "fl-btn fl-btn-secondary"
              }
              style={{ padding: "0.4rem 0.75rem", fontSize: "0.68rem" }}
            >
              {lockedOptimistic ? "🔓 Déverrouiller" : "🔒 Verrouiller"}
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
              {adjustedIngredients.map((ing, idx) => (
                <tr
                  key={idx}
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
                      width: 140,
                    }}
                  >
                    {ing.quantityGMax != null ? (
                      <span>
                        {ing.quantityG}
                        <span style={{ color: "var(--muted)" }}>/</span>
                        {ing.quantityGMax}
                        {" "}<span style={{ color: "var(--muted)" }}>{ing.unit}</span>
                      </span>
                    ) : (
                      <>
                        {ing.quantityG}
                        {" "}<span style={{ color: "var(--muted)" }}>{ing.unit}</span>
                      </>
                    )}
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
                  {roundedChildMin !== roundedChildMax
                    ? `${formatG(roundedChildMin)}/${formatG(roundedChildMax)}`
                    : formatG(roundedChildMin)}
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
  const [isExact, setIsExact] = useState(subRecipe.isExact);
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
    fd.set("isExact", String(isExact));
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

        {calcMode === "mass_target" && (
          <button
            type="button"
            onClick={() => setIsExact((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.4rem 0.75rem",
              borderRadius: 8,
              border: "1px solid",
              borderColor: isExact ? "var(--accent)" : "var(--border)",
              background: isExact ? "rgba(232,197,71,0.12)" : "transparent",
              color: isExact ? "var(--accent)" : "var(--muted)",
              fontSize: "0.75rem",
              fontFamily: "var(--font-mono)",
              cursor: "pointer",
              fontWeight: isExact ? 600 : 400,
            }}
          >
            <span>{isExact ? "⚖️" : "≈"}</span>
            Masse exacte — ajuste ±1 g sur les plus gros ingrédients
          </button>
        )}

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
