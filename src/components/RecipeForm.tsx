"use client";

import Link from "next/link";
import { useState } from "react";
import { parseIngredientsText } from "@/lib/parseIngredientsText";
import { RichTextEditor } from "./RichTextEditor";
import { CategoryCombobox } from "./CategoryCombobox";
import { IngredientNameInput } from "./IngredientNameInput";

type IngredientUnit = "g" | "L" | "cc" | "cs" | "pièce" | "QS";
const UNITS: IngredientUnit[] = ["g", "L", "cc", "cs", "pièce", "QS"];
const UNIT_LABELS: Record<IngredientUnit, string> = {
  g: "g",
  L: "L",
  cc: "cc (~5g)",
  cs: "cs (~15g)",
  pièce: "pièce",
  QS: "QS",
};

type IngredientRow = {
  name: string;
  quantity: string;
  unit: IngredientUnit;
};

type IngredientMode = "list" | "text";

export type RecipeFormInitial = {
  id?: number;
  name?: string;
  source?: string | null;
  notesTips?: string | null;
  steps?: string | null;
  favorite?: boolean;
  rating?: number | null;
  tags?: string[];
  categoryIds?: number[];
  folderId?: number | null;
  ingredients?: { name: string; quantityG: number; unit?: string }[];
};

export function RecipeForm({
  initial,
  categories,
  folders,
  action,
  submitLabel = "Enregistrer",
}: {
  initial?: RecipeFormInitial;
  categories: { id: number; name: string; color: string }[];
  folders: { id: number; name: string; color: string }[];
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((i) => ({
          name: i.name,
          quantity: i.unit === "QS" ? "" : String(i.quantityG),
          unit: (i.unit as IngredientUnit) ?? "g",
        }))
      : [{ name: "", quantity: "", unit: "g" }],
  );
  const [folderId, setFolderId] = useState<number | "">(initial?.folderId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ingredientMode, setIngredientMode] = useState<IngredientMode>("list");
  const [freeText, setFreeText] = useState("");

  const totalG = ingredients.reduce((s, r) => {
    const q = Number(r.quantity) || 0;
    if (r.unit === "g") return s + q;
    if (r.unit === "cc") return s + q * 5;
    if (r.unit === "cs") return s + q * 15;
    return s;
  }, 0);

  const addRow = () =>
    setIngredients((rows) => [...rows, { name: "", quantity: "", unit: "g" }]);

  const removeRow = (idx: number) =>
    setIngredients((rows) =>
      rows.length === 1 ? rows : rows.filter((_, i) => i !== idx),
    );

  const moveRow = (idx: number, dir: -1 | 1) =>
    setIngredients((rows) => {
      const target = idx + dir;
      if (target < 0 || target >= rows.length) return rows;
      const next = rows.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });

  const importFreeText = () => {
    const parsed = parseIngredientsText(freeText);
    if (parsed.length === 0) {
      setError("Aucun ingrédient détecté dans le texte.");
      return;
    }
    setError(null);
    setIngredients(
      parsed.map((p) => ({
        name: p.name,
        quantity: p.quantityG > 0 ? String(p.quantityG) : "",
        unit: "g" as IngredientUnit,
      })),
    );
    setIngredientMode("list");
  };

  const onSubmit = async (formData: FormData) => {
    setError(null);
    if (!formData.get("name")?.toString().trim()) {
      setError("Le nom est obligatoire.");
      return;
    }
    const hasValidIngredient = ingredients.some(
      (r) => r.name.trim() && (r.unit === "QS" || Number(r.quantity) > 0),
    );
    if (!hasValidIngredient) {
      setError("Au moins un ingrédient avec une quantité (ou QS) est obligatoire.");
      return;
    }
    setSubmitting(true);
    try {
      await action(formData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
      setSubmitting(false);
    }
  };

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      <Field label="Nom de la recette *">
        <input
          name="name"
          className="fl-input"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ""}
          placeholder="Ex : Tarte citron meringuée"
        />
      </Field>

      {folders.length > 0 && (
        <Field label="📁 Dossier">
          <select
            name="folderId"
            value={folderId}
            onChange={(e) =>
              setFolderId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="fl-input"
          >
            <option value="">— Aucun dossier —</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {categories.length > 0 && (
        <Field label="Catégories">
          <CategoryCombobox
            allCategories={categories}
            initialSelected={initial?.categoryIds ?? []}
          />
        </Field>
      )}

      <Field label="Tags (séparés par une virgule)">
        <input
          name="tags"
          className="fl-input"
          defaultValue={initial?.tags?.join(", ") ?? ""}
          placeholder="framboise, été, tarte"
        />
      </Field>

      <Field label={`Ingrédients * (masse totale : ${Math.round(totalG)} g — ingrédients en g uniquement)`}>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setIngredientMode("list")}
              className={`fl-btn ${ingredientMode === "list" ? "fl-btn-primary" : "fl-btn-secondary"}`}
              style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
            >
              📋 Liste
            </button>
            <button
              type="button"
              onClick={() => setIngredientMode("text")}
              className={`fl-btn ${ingredientMode === "text" ? "fl-btn-primary" : "fl-btn-secondary"}`}
              style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem" }}
            >
              📝 Texte libre
            </button>
          </div>

          {ingredientMode === "text" ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="fl-input"
                rows={10}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={"Colle ou saisis tes ingrédients, un par ligne :\n\n200g farine\n100g beurre\n3 oeufs\n\nOu format fiche pâtissier :\nFarine\n- 200g\nBeurre\n- 100g"}
              />
              <div className="flex gap-2 items-center">
                <button
                  type="button"
                  onClick={importFreeText}
                  className="fl-btn fl-btn-primary"
                  disabled={!freeText.trim()}
                  style={{ padding: "0.5rem 1rem", fontSize: "0.9rem" }}
                >
                  ↓ Importer dans la liste
                </button>
                <span className="fl-label" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                  Le bouton remplit la liste structurée à partir de ton texte
                </span>
              </div>
              {/* Champs cachés pour conserver les ingrédients lors du submit */}
              {ingredients.map((row, idx) => (
                <div key={idx} style={{ display: "none" }}>
                  <input name="ingredientQty" value={row.unit === "QS" ? "0" : row.quantity} readOnly />
                  <input name="ingredientName" value={row.name} readOnly />
                  <input name="ingredientUnit" value={row.unit} readOnly />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {ingredients.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  {row.unit !== "QS" ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="ingredientQty"
                      placeholder="0"
                      className="fl-input"
                      style={{ width: 80, textAlign: "right" }}
                      value={row.quantity}
                      onChange={(e) =>
                        setIngredients((rows) =>
                          rows.map((r, i) =>
                            i === idx ? { ...r, quantity: e.target.value } : r,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input type="hidden" name="ingredientQty" value="0" />
                  )}
                  <UnitSelector
                    value={row.unit}
                    onChange={(unit) =>
                      setIngredients((rows) =>
                        rows.map((r, i) => i === idx ? { ...r, unit } : r),
                      )
                    }
                  />
                  <input type="hidden" name="ingredientUnit" value={row.unit} />
                  <IngredientNameInput
                    value={row.name}
                    onChange={(name) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, name } : r,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => moveRow(idx, -1)}
                    disabled={idx === 0}
                    className="fl-btn fl-btn-secondary"
                    style={{ padding: "0.4rem 0.55rem" }}
                    aria-label="Monter"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(idx, 1)}
                    disabled={idx === ingredients.length - 1}
                    className="fl-btn fl-btn-secondary"
                    style={{ padding: "0.4rem 0.55rem" }}
                    aria-label="Descendre"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    disabled={ingredients.length === 1}
                    className="fl-btn fl-btn-danger"
                    style={{ padding: "0.4rem 0.6rem" }}
                    aria-label="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addRow}
                className="fl-btn fl-btn-secondary self-start"
              >
                + Ingrédient
              </button>
            </div>
          )}
        </div>
      </Field>

      <Field label="Étapes (mise en forme : gras, italique, souligné)">
        <RichTextEditor
          name="steps"
          initialHtml={initial?.steps ?? ""}
          placeholder={"Préparer la pâte...\nCuire 20 min à 180°C\n..."}
        />
      </Field>

      <Field label="Source (livre, site, chef…)">
        <input
          name="source"
          className="fl-input"
          defaultValue={initial?.source ?? ""}
        />
      </Field>

      <Field label="Notes & astuces">
        <textarea
          name="notesTips"
          className="fl-input"
          rows={4}
          defaultValue={initial?.notesTips ?? ""}
        />
      </Field>

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            name="favorite"
            defaultChecked={initial?.favorite ?? false}
          />
          <span className="fl-label">Favori</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="fl-label">Note</span>
          <select
            name="rating"
            className="fl-input"
            defaultValue={initial?.rating ?? ""}
            style={{ width: 90 }}
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((v) => (
              <option key={v} value={v}>
                {"★".repeat(v)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div
          className="fl-card"
          style={{
            background: "rgba(232, 92, 71, 0.08)",
            borderColor: "rgba(232, 92, 71, 0.4)",
            color: "var(--danger)",
            padding: "0.8rem 1rem",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="fl-btn fl-btn-primary"
        >
          {submitting ? "Enregistrement…" : submitLabel}
        </button>
        <Link
          href={initial?.id ? `/recipes/${initial.id}` : "/"}
          className="fl-btn fl-btn-secondary"
        >
          Annuler
        </Link>
      </div>
    </form>
  );
}

function UnitSelector({
  value,
  onChange,
}: {
  value: IngredientUnit;
  onChange: (u: IngredientUnit) => void;
}) {
  const [open, setOpen] = useState(false);
  const isQs = value === "QS";

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="fl-btn fl-btn-secondary"
        style={{
          padding: "0.35rem 0.55rem",
          fontSize: "0.8rem",
          minWidth: 46,
          fontWeight: 600,
          background: isQs ? "var(--accent)" : undefined,
          color: isQs ? "var(--bg)" : undefined,
          borderColor: isQs ? "var(--accent)" : undefined,
        }}
        aria-label="Changer l'unité"
      >
        {value}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "110%",
            left: 0,
            zIndex: 50,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            overflow: "hidden",
            minWidth: 80,
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}
        >
          {UNITS.map((u) => (
            <button
              key={u}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(u);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "0.45rem 0.8rem",
                textAlign: "left",
                fontSize: "0.85rem",
                fontWeight: u === value ? 700 : 400,
                background: u === value ? "var(--accent)" : "transparent",
                color: u === value ? "var(--bg)" : "var(--text)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {UNIT_LABELS[u]}
            </button>
          ))}
        </div>
      )}
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
    <label className="flex flex-col gap-1.5">
      <span className="fl-label">{label}</span>
      {children}
    </label>
  );
}
