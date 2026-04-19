"use client";

import { useOptimistic, useTransition, useState } from "react";
import {
  toggleItem,
  removeItem,
  addManualItem,
  uncheckAll,
  removeChecked,
} from "@/app/actions/shopping";

type Item = {
  id: number;
  name: string;
  quantityG: number | null;
  checked: boolean;
  recipeId: number | null;
};

function formatG(g: number): string {
  if (g >= 1000) return (g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg";
  return g.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " g";
}

export function ShoppingListItems({
  listId,
  initialItems,
}: {
  listId: number;
  initialItems: Item[];
}) {
  const [, startTransition] = useTransition();
  const [optimisticItems, updateOptimistic] = useOptimistic(
    initialItems,
    (state, action: { type: "toggle"; id: number } | { type: "remove"; id: number }) => {
      if (action.type === "toggle") {
        return state.map((i) =>
          i.id === action.id ? { ...i, checked: !i.checked } : i,
        );
      }
      return state.filter((i) => i.id !== action.id);
    },
  );

  const [manualName, setManualName] = useState("");
  const [manualQty, setManualQty] = useState("");
  const [adding, setAdding] = useState(false);

  const checkedCount = optimisticItems.filter((i) => i.checked).length;
  const recipeItems = optimisticItems.filter((i) => i.recipeId !== null);
  const manualItems = optimisticItems.filter((i) => i.recipeId === null);

  function handleToggle(id: number) {
    startTransition(() => {
      updateOptimistic({ type: "toggle", id });
      void toggleItem(id, listId);
    });
  }

  function handleRemove(id: number) {
    startTransition(() => {
      updateOptimistic({ type: "remove", id });
      void removeItem(id, listId);
    });
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    const qty = manualQty ? parseFloat(manualQty) : null;
    setAdding(true);
    await addManualItem(listId, name, qty && !isNaN(qty) ? qty : null);
    setManualName("");
    setManualQty("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Actions groupées */}
      {optimisticItems.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={() => startTransition(() => { void removeChecked(listId); })}
              className="fl-btn fl-btn-danger"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
            >
              Supprimer les cochés ({checkedCount})
            </button>
          )}
          {checkedCount > 0 && (
            <button
              type="button"
              onClick={() => startTransition(() => { void uncheckAll(listId); })}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
            >
              Tout décocher
            </button>
          )}
        </div>
      )}

      {/* Items depuis recettes */}
      {recipeItems.length > 0 && (
        <div className="fl-card flex flex-col gap-1 p-3">
          <p className="fl-label mb-2">Ingrédients des recettes</p>
          {recipeItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Items manuels */}
      {manualItems.length > 0 && (
        <div className="fl-card flex flex-col gap-1 p-3">
          <p className="fl-label mb-2">Articles manuels</p>
          {manualItems.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Ajouter un article manuel */}
      <form onSubmit={handleAddManual} className="fl-card flex flex-col gap-3 p-3">
        <p className="fl-label">Ajouter un article</p>
        <div className="flex gap-2">
          <input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="Nom de l'article"
            className="fl-input flex-1"
            style={{ fontSize: "0.9rem" }}
          />
          <input
            value={manualQty}
            onChange={(e) => setManualQty(e.target.value)}
            placeholder="Qté (g)"
            type="number"
            min="0"
            step="0.1"
            className="fl-input"
            style={{ width: 100, fontSize: "0.9rem" }}
          />
          <button
            type="submit"
            disabled={adding || !manualName.trim()}
            className="fl-btn fl-btn-primary"
            style={{ fontSize: "0.85rem", whiteSpace: "nowrap" }}
          >
            {adding ? "…" : "+ Ajouter"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ItemRow({
  item,
  onToggle,
  onRemove,
}: {
  item: Item;
  onToggle: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-3 py-1.5 rounded"
      style={{ opacity: item.checked ? 0.5 : 1 }}
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={() => onToggle(item.id)}
        className="accent-[color:var(--accent-2)] w-4 h-4 flex-shrink-0 cursor-pointer"
      />
      <span
        className="flex-1 text-sm"
        style={{ textDecoration: item.checked ? "line-through" : "none" }}
      >
        {item.name}
      </span>
      {item.quantityG !== null && (
        <span className="fl-label" style={{ whiteSpace: "nowrap" }}>
          {formatG(item.quantityG)}
        </span>
      )}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="fl-label hover:text-[color:var(--danger)] flex-shrink-0"
        style={{ fontSize: "1rem", lineHeight: 1, padding: "0 4px" }}
        aria-label="Retirer"
      >
        ×
      </button>
    </div>
  );
}
