"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChefHat,
  CircleAlert,
  FileText,
  ListPlus,
  MoveHorizontal,
  Plus,
  Save,
  Scale,
  Star,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { parseIngredientsText } from "@/lib/parseIngredientsText";
import { recipeMass } from "@/lib/massAdjust";
import { formatG } from "@/lib/format";
import { Help } from "@/components/ui/Help";
import { MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { CategoryCombobox } from "./CategoryCombobox";
import { IngredientNameInput } from "./IngredientNameInput";
import { htmlToPlainText } from "@/lib/stepsText";

type IngredientUnit = "g" | "L" | "cc" | "cs" | "pièce" | "QS";
const UNITS: IngredientUnit[] = ["g", "L", "cc", "cs", "pièce", "QS"];
const isUnit = (u: string | undefined): u is IngredientUnit => UNITS.includes(u as IngredientUnit);

type IngredientRow = {
  /** Clé stable pour React (les lignes peuvent être réordonnées). */
  key: number;
  name: string;
  quantity: string;
  /** Quantité max, utilisée seulement si `range` est vrai. */
  quantityMax: string;
  range: boolean;
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
  ingredients?: { name: string; quantityG: number; quantityGMax?: number | null; unit?: string }[];
};

let nextKey = 1;
const emptyRow = (): IngredientRow => ({ key: nextKey++, name: "", quantity: "", quantityMax: "", range: false, unit: "g" });

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
  const [ingredients, setIngredients] = useState<IngredientRow[]>(() =>
    initial?.ingredients?.length
      ? initial.ingredients.map((i) => {
          const unit = isUnit(i.unit) ? i.unit : "g";
          return {
            key: nextKey++,
            name: i.name,
            quantity: unit === "QS" ? "" : String(i.quantityG),
            quantityMax: i.quantityGMax != null ? String(i.quantityGMax) : "",
            range: i.quantityGMax != null && unit !== "QS",
            unit,
          };
        })
      : [emptyRow()],
  );
  const [folderId, setFolderId] = useState<number | "">(initial?.folderId ?? "");
  const [favorite, setFavorite] = useState(initial?.favorite ?? false);
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ingredientMode, setIngredientMode] = useState<IngredientMode>("list");
  const [freeText, setFreeText] = useState("");
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const markDirty = useCallback(() => setDirty(true), []);

  // Prévient avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty || submitting) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty, submitting]);

  // Place le curseur dans le nom d'un ingrédient qu'on vient d'ajouter.
  useEffect(() => {
    if (focusKey == null) return;
    const idx = ingredients.findIndex((r) => r.key === focusKey);
    rowsRef.current?.querySelector<HTMLInputElement>(`[data-row="${idx}"] .rf-ing-name input`)?.focus();
    setFocusKey(null);
  }, [focusKey, ingredients]);

  const mass = recipeMass(
    ingredients.map((r) => ({
      quantityG: Number(r.quantity) || 0,
      quantityGMax: r.range && r.quantityMax ? Number(r.quantityMax) || 0 : null,
      unit: r.unit,
    })),
  );

  const updateRow = (idx: number, patch: Partial<IngredientRow>) => {
    setIngredients((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRow = () => {
    const row = emptyRow();
    setIngredients((rows) => [...rows, row]);
    setFocusKey(row.key);
    setDirty(true);
  };

  const removeRow = (idx: number) => {
    setIngredients((rows) => (rows.length === 1 ? [emptyRow()] : rows.filter((_, i) => i !== idx)));
    setDirty(true);
  };

  const moveRow = (idx: number, dir: -1 | 1) => {
    setIngredients((rows) => {
      const target = idx + dir;
      if (target < 0 || target >= rows.length) return rows;
      const next = rows.slice();
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
    setDirty(true);
  };

  const setUnit = (idx: number, unit: IngredientUnit) =>
    updateRow(idx, unit === "QS" ? { unit, quantity: "", quantityMax: "", range: false } : { unit });

  const toggleRange = (idx: number, row: IngredientRow) => {
    if (row.range) return updateRow(idx, { range: false, quantityMax: "" });
    updateRow(idx, { range: true, quantityMax: "", unit: row.unit === "QS" ? "g" : row.unit });
    // Place le curseur dans la nouvelle case « max ».
    setTimeout(() => rowsRef.current?.querySelector<HTMLInputElement>(`[data-row="${idx}"] input[aria-label="Quantité max"]`)?.focus(), 50);
  };

  const importFreeText = (append: boolean) => {
    const parsed = parseIngredientsText(freeText);
    if (parsed.length === 0) {
      setError("Aucun ingrédient trouvé dans le texte.");
      return;
    }
    setError(null);
    const rows: IngredientRow[] = parsed.map((p) => {
      const unit = isUnit(p.unit) ? p.unit : "g";
      return {
        key: nextKey++,
        name: p.name,
        quantity: unit !== "QS" && p.quantityG > 0 ? String(p.quantityG) : "",
        quantityMax: p.quantityGMax != null ? String(p.quantityGMax) : "",
        range: p.quantityGMax != null,
        unit,
      };
    });
    setIngredients((cur) => {
      const kept = cur.filter((r) => r.name.trim() || r.quantity);
      return append ? [...kept, ...rows] : rows;
    });
    setFreeText("");
    setIngredientMode("list");
    setDirty(true);
  };

  const onSubmit = async (formData: FormData) => {
    setError(null);
    if (!formData.get("name")?.toString().trim()) {
      setError("Le nom de la recette est obligatoire.");
      return;
    }
    const hasValidIngredient = ingredients.some(
      (r) => r.name.trim() && (r.unit === "QS" || Number(r.quantity) > 0),
    );
    if (!hasValidIngredient) {
      setError("Ajoute au moins un ingrédient avec une quantité (ou QS).");
      return;
    }
    const badRange = ingredients.findIndex(
      (r) => r.name.trim() && r.range && r.quantityMax !== "" && Number(r.quantityMax) <= Number(r.quantity),
    );
    if (badRange >= 0) {
      setError(`Ligne ${badRange + 1} : la quantité max doit être plus grande que la quantité min.`);
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

  const rowMenu = (idx: number, row: IngredientRow): MenuSpec => ({
    title: row.name.trim() || `Ingrédient ${idx + 1}`,
    items: [
      {
        label: row.range ? "Quantité simple" : "Fourchette (min – max)",
        icon: MoveHorizontal,
        disabled: row.unit === "QS",
        onSelect: () => toggleRange(idx, row),
      },
      { separator: true },
      { label: "Monter", icon: ArrowUp, disabled: idx === 0, onSelect: () => moveRow(idx, -1) },
      { label: "Descendre", icon: ArrowDown, disabled: idx === ingredients.length - 1, onSelect: () => moveRow(idx, 1) },
      { separator: true },
      { label: "Supprimer", icon: Trash2, danger: true, onSelect: () => removeRow(idx) },
    ],
  });

  const cancelHref = initial?.id ? `/recipes/${initial.id}` : "/";

  return (
    <form action={onSubmit} onInput={markDirty} className="rf-form">
      {/* ─── Informations ─────────────────────────────────────────── */}
      <Section icon={FileText} title="Informations">
        <Field label="Nom de la recette">
          <input
            name="name"
            className="fl-input"
            required
            maxLength={200}
            defaultValue={initial?.name ?? ""}
            placeholder="Ex. Tarte citron meringuée"
            autoFocus={!initial?.id}
          />
        </Field>

        <div className="rf-grid2">
          {folders.length > 0 && (
            <Field label="Dossier">
              <select
                name="folderId"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value === "" ? "" : Number(e.target.value))}
                className="fl-input"
              >
                <option value="">Aucun dossier</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Source" hint="Livre, site, chef…">
            <input name="source" className="fl-input" defaultValue={initial?.source ?? ""} placeholder="Ex. Pâtisserie, Christophe Felder" />
          </Field>
        </div>

        <Field
          label="Catégories"
          help={{
            title: "Catégories ou tags ?",
            text: "Les catégories sont une liste commune, avec une couleur, qui sert à filtrer et à ranger tes recettes (ex. Tartes, Entremets). Tape un nom qui n'existe pas pour créer une nouvelle catégorie. Les tags sont des mots libres, propres à cette recette (ex. framboise, été).",
          }}
        >
          <CategoryCombobox allCategories={categories} initialSelected={initial?.categoryIds ?? []} onChange={markDirty} />
        </Field>

        <Field
          label="Tags"
          hint="Sépare les tags par une virgule."
          help={{
            title: "Tags",
            text: "Mots libres pour retrouver la recette avec la recherche. Contrairement aux catégories, ils n'ont pas de couleur et ne servent pas au classement.",
            example: "framboise, été, sans gluten",
          }}
        >
          <input name="tags" className="fl-input" defaultValue={initial?.tags?.join(", ") ?? ""} placeholder="framboise, été, tarte" />
        </Field>

        <div className="rf-grid2">
          <div className="rf-field">
            <Label
              text="Note"
              help={{
                title: "Note",
                text: "Ton avis sur la recette, de 1 à 5 étoiles. Clique sur l'étoile déjà choisie pour retirer la note. Elle sert au tri et peut être imprimée sur le PDF.",
              }}
            />
            <div className="rf-stars" role="radiogroup" aria-label="Note">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={rating === v}
                  aria-label={`${v} étoile${v > 1 ? "s" : ""}`}
                  className="rf-star"
                  data-on={rating != null && v <= rating}
                  onClick={() => {
                    setRating(rating === v ? null : v);
                    setDirty(true);
                  }}
                >
                  <Star size={20} fill={rating != null && v <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              {rating == null && <span className="rf-hint" style={{ marginLeft: 6 }}>Pas de note</span>}
            </div>
            <input type="hidden" name="rating" value={rating ?? ""} />
          </div>
          <div className="rf-field">
            <Label text="Favori" />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 36 }}>
              <span style={{ fontSize: 13.5, color: "var(--soft)" }}>Mettre dans les favoris</span>
              <button
                type="button"
                role="switch"
                aria-checked={favorite}
                aria-label="Favori"
                className="fl-switch"
                onClick={() => {
                  setFavorite(!favorite);
                  setDirty(true);
                }}
              />
            </div>
            {favorite && <input type="hidden" name="favorite" value="on" />}
          </div>
        </div>
      </Section>

      {/* ─── Ingrédients ──────────────────────────────────────────── */}
      <Section
        icon={Scale}
        title="Ingrédients"
        extra={
          <span className="rf-mass">
            Masse totale <b className="num">{formatG(mass.avg)}</b>
            <Help
              title="Masse totale"
              calc={"g      = quantité\ncc     = quantité × 5 g\ncs     = quantité × 15 g\nL      = quantité × 1000 g\npièce, QS = non comptés"}
              example={
                mass.min !== mass.max ? (
                  <>
                    Avec tes fourchettes : entre {formatG(mass.min)} et {formatG(mass.max)}, la moyenne ({formatG(mass.avg)}) est affichée.
                  </>
                ) : (
                  "200 g de farine + 2 cs de sucre (30 g) + 3 œufs (pièces, non comptés) = 230 g."
                )
              }
            >
              Somme des quantités de la recette, recalculée pendant que tu tapes. Sert à adapter
              la recette à une autre masse. Pour une fourchette, c&apos;est la moyenne entre min et max.
            </Help>
          </span>
        }
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <div className="fl-seg" role="group" aria-label="Mode de saisie">
            <button type="button" aria-pressed={ingredientMode === "list"} onClick={() => setIngredientMode("list")}>
              Liste
            </button>
            <button type="button" aria-pressed={ingredientMode === "text"} onClick={() => setIngredientMode("text")}>
              Saisie en lot
            </button>
          </div>
          <Help
            title="Saisie en lot"
            example={
              <span style={{ whiteSpace: "pre-line", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {"200g farine\n100-120g sucre\n2 cs huile\n3 oeufs\n\nou format fiche :\nFarine\n- 200g"}
              </span>
            }
          >
            Colle une liste d&apos;ingrédients (un par ligne) : les quantités, unités (g, kg, ml, cc, cs,
            pièces) et fourchettes sont reconnues, puis la liste est remplie automatiquement. Vérifie le
            résultat avant d&apos;enregistrer.
          </Help>
        </div>

        {ingredientMode === "text" ? (
          <div className="rf-bulk">
            <textarea
              className="fl-input"
              rows={10}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              aria-label="Ingrédients en texte libre"
              placeholder={"Un ingrédient par ligne :\n\n200g farine\n100g beurre\n3 oeufs"}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button type="button" className="fl-btn fl-btn-secondary" disabled={!freeText.trim()} onClick={() => importFreeText(true)}>
                <ListPlus size={16} /> Ajouter à la suite
              </button>
              <button
                type="button"
                className="fl-btn fl-btn-primary"
                disabled={!freeText.trim()}
                onClick={() => {
                  const hasRows = ingredients.some((r) => r.name.trim());
                  if (hasRows && !confirm("Remplacer les ingrédients déjà saisis par ceux du texte ?")) return;
                  importFreeText(false);
                }}
              >
                Remplir la liste
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="rf-ings"
              ref={rowsRef}
              onKeyDown={(e) => {
                // Entrée dans une ligne ne doit pas envoyer le formulaire.
                if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
              }}
            >
              <div className="rf-ing-head fl-label">
                <span />
                <span>Ingrédient</span>
                <span>
                  Quantité
                  <RangeHelp />
                </span>
                <span>
                  Unité
                  <UnitHelp />
                </span>
                <span />
                <span />
              </div>

              {ingredients.map((row, idx) => (
                <div key={row.key} className="rf-ing" data-row={idx}>
                  <span className="rf-ing-num">{idx + 1}</span>
                  <div className="rf-ing-name">
                    <IngredientNameInput
                      value={row.name}
                      ariaLabel={`Ingrédient ${idx + 1}`}
                      onChange={(name) => updateRow(idx, { name })}
                    />
                  </div>
                  <div className="rf-ing-qty">
                    {row.unit === "QS" ? (
                      <div className="rf-ing-qs">selon le goût</div>
                    ) : (
                      <>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          inputMode="decimal"
                          className="fl-input num"
                          placeholder={row.range ? "min" : "0"}
                          aria-label={row.range ? "Quantité min" : "Quantité"}
                          value={row.quantity}
                          onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                        />
                        {row.range && (
                          <>
                            <span className="rf-dash">–</span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              inputMode="decimal"
                              className="fl-input num"
                              placeholder="max"
                              aria-label="Quantité max"
                              value={row.quantityMax}
                              onChange={(e) => updateRow(idx, { quantityMax: e.target.value })}
                            />
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <select
                    className="fl-input rf-ing-unit"
                    aria-label="Unité"
                    value={row.unit}
                    onChange={(e) => setUnit(idx, e.target.value as IngredientUnit)}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u} disabled={u === "QS" && row.range}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="fl-btn fl-btn-ghost fl-btn-icon rf-ing-del"
                    aria-label={`Supprimer l'ingrédient ${idx + 1}`}
                    title="Supprimer"
                    onClick={() => removeRow(idx)}
                  >
                    <X size={16} />
                  </button>
                  <div className="rf-ing-more">
                    <MoreButton spec={() => rowMenu(idx, row)} label={`Actions pour l'ingrédient ${idx + 1}`} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <button type="button" onClick={addRow} className="fl-btn fl-btn-secondary">
                <Plus size={16} /> Ajouter un ingrédient
              </button>
              {/* Sur téléphone, les aides des colonnes (masquées) sont ici. */}
              <span className="rf-hint rf-ing-mobhelp">
                Unités <UnitHelp />
                <span style={{ marginLeft: 12 }}>Fourchette</span> <RangeHelp />
              </span>
            </div>
          </>
        )}

        {/* Champs envoyés avec le formulaire (une entrée par ligne, dans l'ordre) */}
        {ingredients.map((row) => (
          <div key={row.key} hidden>
            <input type="hidden" name="ingredientName" value={row.name} />
            <input type="hidden" name="ingredientQty" value={row.unit === "QS" ? "0" : row.quantity} />
            <input type="hidden" name="ingredientQtyMax" value={row.range ? row.quantityMax : ""} />
            <input type="hidden" name="ingredientUnit" value={row.unit} />
          </div>
        ))}
      </Section>

      {/* ─── Préparation ──────────────────────────────────────────── */}
      <Section
        icon={ChefHat}
        title="Préparation"
        help="Écris une étape par ligne. La numérotation (1, 2, 3…) est ajoutée automatiquement à l'affichage et dans le PDF."
      >
        <textarea
          name="steps"
          className="fl-input rf-textarea"
          rows={10}
          aria-label="Étapes de préparation"
          defaultValue={htmlToPlainText(initial?.steps ?? "")}
          placeholder={"Une étape par ligne :\n\nPréparer la pâte sablée\nCuire 20 min à 180 °C\nGarnir et laisser refroidir"}
        />
      </Section>

      {/* ─── Notes ────────────────────────────────────────────────── */}
      <Section icon={StickyNote} title="Notes et astuces">
        <textarea
          name="notesTips"
          className="fl-input rf-textarea"
          rows={4}
          aria-label="Notes et astuces"
          defaultValue={initial?.notesTips ?? ""}
          placeholder="Conservation, variantes, conseils…"
        />
      </Section>

      <div className="theme-savebar">
        <span style={{ fontSize: 13, marginRight: "auto", minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          {error ? (
            <span style={{ color: "var(--danger)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <CircleAlert size={15} style={{ flex: "none" }} /> {error}
            </span>
          ) : dirty ? (
            <span style={{ color: "var(--accent)" }}>Modifications non enregistrées</span>
          ) : (
            <span style={{ color: "var(--muted)" }}>{initial?.id ? "Aucune modification" : "Nom et un ingrédient minimum"}</span>
          )}
        </span>
        <Link href={cancelHref} className="fl-btn fl-btn-ghost desk-only">
          Annuler
        </Link>
        <button type="submit" disabled={submitting} className="fl-btn fl-btn-primary">
          <Save size={16} /> {submitting ? "Enregistrement…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function RangeHelp() {
  return (
    <Help title="Quantité et fourchette" example="« 100 à 120 g de sucre » : saisis 100 et 120. La masse totale compte 110 g.">
      La quantité dans l&apos;unité choisie. Si la recette donne une fourchette, ouvre le menu de la
      ligne (bouton à trois points) et choisis « Fourchette » : une case « max » apparaît. La masse
      totale utilise alors la moyenne entre min et max.
    </Help>
  );
}

function UnitHelp() {
  return (
    <Help
      title="Unités"
      calc={"g      gramme\nL      litre ≈ 1000 g\ncc     cuillère à café ≈ 5 g\ncs     cuillère à soupe ≈ 15 g\npièce  à l'unité (œufs…), non comptée\nQS     quantité suffisante, non comptée"}
    >
      L&apos;unité de chaque ingrédient. Les litres et les cuillères sont convertis en grammes pour la
      masse totale. Les pièces et « QS » (selon le goût) ne sont pas comptés dans la masse.
    </Help>
  );
}

// ─── Petits composants de formulaire ─────────────────────────────────────────

type HelpSpec = { title: string; text: string; calc?: string; example?: React.ReactNode };

function Section({
  icon: Icon,
  title,
  help,
  extra,
  children,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  help?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="fl-card rf-section">
      <h2 className="rf-section-head">
        <span className="rf-ic">
          <Icon size={17} />
        </span>
        {title}
        {help && <Help title={title}>{help}</Help>}
        {extra}
      </h2>
      {children}
    </section>
  );
}

function Label({ text, help }: { text: string; help?: HelpSpec }) {
  return (
    <span className="fl-label rf-label">
      {text}
      {help && (
        <Help title={help.title} calc={help.calc} example={help.example}>
          {help.text}
        </Help>
      )}
    </span>
  );
}

function Field({ label, help, hint, children }: { label: string; help?: HelpSpec; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rf-field">
      <Label text={label} help={help} />
      {children}
      {hint && <p className="rf-hint">{hint}</p>}
    </div>
  );
}
