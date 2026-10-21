"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { BookOpen, ExternalLink, Plus, Scale, Search, Trash2 } from "lucide-react";
import { addRecipeToList, removeRecipeFromList } from "@/app/actions/shopping";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { Help } from "@/components/ui/Help";
import { ModalOverlay } from "@/components/ModalOverlay";
import { formatCoef } from "@/lib/format";

type LinkedRecipe = { recipeId: number; name: string; coefficient: number };
type AvailableRecipe = { id: number; name: string };

const COEF_PRESETS = [0.5, 1, 2, 3];

/** Explication du coefficient, réutilisée dans le panneau et la fenêtre. */
function CoefHelp() {
  return (
    <Help
      title="Coefficient"
      calc="quantité dans la liste = quantité de la recette × coefficient"
      example="Coefficient 2 : 250 g de farine deviennent 500 g (la recette faite deux fois). Coefficient 0,5 : la moitié."
    >
      Le coefficient multiplie toutes les quantités de la recette avant de les ajouter à la liste.
      Les ingrédients communs à plusieurs recettes sont ensuite additionnés.
    </Help>
  );
}

/**
 * Recettes de la liste avec leur coefficient. Ajouter une recette ou changer
 * son coefficient régénère les articles (les cases cochées restent cochées).
 */
export function AddRecipeToListPanel({
  listId,
  linkedRecipes,
  availableRecipes,
}: {
  listId: number;
  linkedRecipes: LinkedRecipe[];
  availableRecipes: AvailableRecipe[];
}) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ edit?: LinkedRecipe } | null>(null);

  function handleRemove(recipeId: number) {
    startTransition(async () => {
      await removeRecipeFromList(listId, recipeId);
    });
  }

  return (
    <div className="fl-card sh-recipes" aria-busy={pending}>
      <div className="sh-head" style={{ marginBottom: 6 }}>
        <h2>Recettes</h2>
        <span className="num">{linkedRecipes.length}</span>
        <CoefHelp />
      </div>

      {linkedRecipes.length === 0 ? (
        <p className="sh-muted">
          Aucune recette. Ajoutes-en une : ses ingrédients s&apos;ajoutent à la liste.
        </p>
      ) : (
        <div className="sh-rlist">
          {linkedRecipes.map((r) => {
            const spec = (): MenuSpec => ({
              title: r.name,
              icon: BookOpen,
              items: [
                { label: "Ouvrir la recette", icon: ExternalLink, href: `/recipes/${r.recipeId}` },
                { label: "Changer le coefficient…", icon: Scale, onSelect: () => setDialog({ edit: r }) },
                { separator: true },
                {
                  label: "Retirer de la liste",
                  icon: Trash2,
                  danger: true,
                  onSelect: () => handleRemove(r.recipeId),
                },
              ],
            });
            return (
              <ContextArea key={r.recipeId} spec={spec} className="sh-rrow">
                <Link href={`/recipes/${r.recipeId}`} className="sh-rrow-name" title={r.name}>
                  {r.name}
                </Link>
                <button
                  type="button"
                  className="fl-tag num sh-coef"
                  onClick={() => setDialog({ edit: r })}
                  aria-label={`Coefficient ${formatCoef(r.coefficient)}, modifier`}
                >
                  {formatCoef(r.coefficient)}
                </button>
                <MoreButton spec={spec} label={`Actions pour ${r.name}`} />
              </ContextArea>
            );
          })}
        </div>
      )}

      {availableRecipes.length > 0 && (
        <button
          type="button"
          className="fl-btn fl-btn-secondary"
          style={{ width: "100%", marginTop: 12 }}
          onClick={() => setDialog({})}
        >
          <Plus size={16} /> Ajouter une recette
        </button>
      )}

      {dialog && (
        <RecipeDialog
          listId={listId}
          edit={dialog.edit}
          availableRecipes={availableRecipes}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

/** Fenêtre : choisir une recette et son coefficient, ou changer le coefficient. */
function RecipeDialog({
  listId,
  edit,
  availableRecipes,
  onClose,
}: {
  listId: number;
  edit?: LinkedRecipe;
  availableRecipes: AvailableRecipe[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(edit?.recipeId ?? null);
  const [coef, setCoef] = useState(String(edit?.coefficient ?? 1).replace(".", ","));
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? availableRecipes.filter((r) => r.name.toLowerCase().includes(q)) : availableRecipes;
  }, [query, availableRecipes]);

  const coefValue = parseFloat(coef.replace(",", "."));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return setError("Choisis une recette.");
    if (!isFinite(coefValue) || coefValue <= 0) return setError("Le coefficient doit être un nombre positif.");
    setError(null);
    startTransition(async () => {
      const r = await addRecipeToList(listId, selectedId, coefValue);
      if (r.ok) onClose();
      else setError(r.error);
    });
  }

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BookOpen size={18} style={{ color: "var(--accent)" }} />
          {edit ? "Changer le coefficient" : "Ajouter une recette"}
        </span>
      }
    >
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {edit ? (
          <p style={{ color: "var(--soft)" }}>{edit.name}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="fl-label">Recette</span>
            <label className="searchbox">
              <Search size={16} />
              <input
                placeholder="Rechercher une recette…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </label>
            <div className="fl-scroll sh-picker">
              {filtered.length === 0 ? (
                <div className="sh-muted" style={{ padding: 12 }}>Aucune recette trouvée.</div>
              ) : (
                filtered.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    className="pdf-theme-opt"
                    aria-pressed={selectedId === r.id}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <span style={{ flex: 1, fontSize: 13.5 }}>{r.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
            Coefficient
            <CoefHelp />
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              className="fl-input num"
              style={{ width: 96 }}
              inputMode="decimal"
              value={coef}
              onChange={(e) => setCoef(e.target.value)}
              aria-label="Coefficient"
              autoFocus={!!edit}
            />
            {COEF_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                className="fl-chip num"
                aria-pressed={coefValue === c}
                onClick={() => setCoef(String(c).replace(".", ","))}
              >
                {formatCoef(c)}
              </button>
            ))}
          </div>
        </div>

        {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">
            Annuler
          </button>
          <button type="submit" disabled={pending || !selectedId} className="fl-btn fl-btn-primary">
            {pending ? "Enregistrement…" : edit ? "Enregistrer" : "Ajouter à la liste"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
