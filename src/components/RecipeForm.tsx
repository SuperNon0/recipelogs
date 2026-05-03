"use client";

import Link from "next/link";
import { useState } from "react";
import { parseIngredientsText } from "@/lib/parseIngredientsText";
import { RichTextEditor } from "./RichTextEditor";

type IngredientRow = {
  name: string;
  quantity: string;
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
  ingredients?: { name: string; quantityG: number }[];
};

export function RecipeForm({
  initial,
  categories,
  action,
  submitLabel = "Enregistrer",
}: {
  initial?: RecipeFormInitial;
  categories: { id: number; name: string; color: string }[];
  action: (formData: FormData) => Promise<void>;
  submitLabel?: string;
}) {
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initial?.ingredients?.length
      ? initial.ingredients.map((i) => ({
          name: i.name,
          quantity: String(i.quantityG),
        }))
      : [{ name: "", quantity: "" }],
  );
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(
    new Set(initial?.categoryIds ?? []),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ingredientMode, setIngredientMode] = useState<IngredientMode>("list");
  const [freeText, setFreeText] = useState("");

  const totalG = ingredients.reduce(
    (s, r) => s + (Number(r.quantity) || 0),
    0,
  );

  const addRow = () =>
    setIngredients((rows) => [...rows, { name: "", quantity: "" }]);

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

  const toggleCategory = (id: number) =>
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    if (totalG <= 0) {
      setError("Au moins un ingrédient avec une quantité est obligatoire.");
      return;
    }
    for (const id of selectedCategories) {
      formData.append("categoryIds", String(id));
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

      {categories.length > 0 && (
        <Field label="Catégories">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const active = selectedCategories.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
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

      <Field label={`Ingrédients * (masse totale : ${Math.round(totalG)} g)`}>
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
                  <input name="ingredientQty" value={row.quantity} readOnly />
                  <input name="ingredientName" value={row.name} readOnly />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {ingredients.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="ingredientQty"
                    placeholder="g"
                    className="fl-input"
                    style={{ width: 90, textAlign: "right" }}
                    value={row.quantity}
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, quantity: e.target.value } : r,
                        ),
                      )
                    }
                  />
                  <input
                    name="ingredientName"
                    placeholder="Ingrédient"
                    className="fl-input flex-1"
                    value={row.name}
                    onChange={(e) =>
                      setIngredients((rows) =>
                        rows.map((r, i) =>
                          i === idx ? { ...r, name: e.target.value } : r,
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

      <Field label="Étapes (mise en forme : gras, italique, couleur…)">
        <RichTextEditor
          name="steps"
          initialHtml={initial?.steps ?? ""}
          placeholder={"1. Préparer la pâte...\n2. Cuire 20 min à 180°C\n..."}
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
