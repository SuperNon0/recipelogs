"use client";

import { useState, useTransition } from "react";
import { addRecipeToList } from "@/app/actions/shopping";
import { ModalOverlay } from "./RecipeBody";
import { fetchShoppingListsForModal } from "@/app/actions/modals";

type ShoppingList = { id: number; name: string };

export function AddToShoppingListButton({ recipeId }: { recipeId: number }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    if (!lists) {
      setLoading(true);
      const data = await fetchShoppingListsForModal();
      setLists(data);
      setLoading(false);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={loading}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.8rem" }}
      >
        {loading ? "…" : "🛒 Ajouter à la liste"}
      </button>
      {open && lists && lists.length > 0 && (
        <AddToShoppingListModal
          recipeId={recipeId}
          lists={lists}
          onClose={() => setOpen(false)}
        />
      )}
      {open && lists && lists.length === 0 && (
        <ModalOverlay onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-4" style={{ minWidth: 280 }}>
            <h2 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>Ajouter à la liste</h2>
            <p className="fl-label" style={{ fontWeight: 400 }}>
              Aucune liste de courses disponible. Créez-en une dans la section Courses.
            </p>
            <button type="button" onClick={() => setOpen(false)} className="fl-btn fl-btn-secondary">
              Fermer
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}

function AddToShoppingListModal({
  recipeId,
  lists,
  onClose,
}: {
  recipeId: number;
  lists: ShoppingList[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [listId, setListId] = useState(lists[0]?.id ?? 0);
  const [coef, setCoef] = useState("1");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const c = parseFloat(coef);
    if (isNaN(c) || c <= 0) {
      setError("Le coefficient doit être un nombre positif.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addRecipeToList(listId, recipeId, c);
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-5" style={{ minWidth: 300 }}>
        <h2 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>
          Ajouter à la liste de courses
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Liste</span>
          <select
            value={listId}
            onChange={(e) => setListId(Number(e.target.value))}
            className="fl-input"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Coefficient (quantité)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={coef}
            onChange={(e) => setCoef(e.target.value)}
            className="fl-input"
          />
          <span className="fl-label" style={{ fontWeight: 400 }}>
            Ex : 2 = doubler toutes les quantités de la recette
          </span>
        </label>

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
