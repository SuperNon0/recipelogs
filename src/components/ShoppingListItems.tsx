"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { Check, Plus, RotateCcw, ShoppingBasket, Trash2 } from "lucide-react";
import { toggleItem, removeItem, addManualItem } from "@/app/actions/shopping";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { Help } from "@/components/ui/Help";
import { formatQty } from "@/lib/format";

type Item = {
  id: number;
  name: string;
  quantityG: number | null;
  unit: string | null;
  checked: boolean;
  recipeId: number | null;
};

type OptimisticAction =
  | { type: "toggle"; id: number }
  | { type: "remove"; id: number }
  | { type: "add"; item: Item };

/**
 * Articles de la liste, pensés pour le téléphone en magasin : ajout rapide en
 * haut, grosses cases à cocher, articles cochés grisés et regroupés en bas.
 */
export function ShoppingListItems({
  listId,
  initialItems,
}: {
  listId: number;
  initialItems: Item[];
}) {
  const [, startTransition] = useTransition();
  const [items, updateOptimistic] = useOptimistic(initialItems, (state, action: OptimisticAction) => {
    if (action.type === "toggle") {
      return state.map((i) => (i.id === action.id ? { ...i, checked: !i.checked } : i));
    }
    if (action.type === "add") return [...state, action.item];
    return state.filter((i) => i.id !== action.id);
  });

  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const todo = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  function handleToggle(id: number) {
    startTransition(async () => {
      updateOptimistic({ type: "toggle", id });
      await toggleItem(id, listId);
    });
  }

  function handleRemove(id: number) {
    startTransition(async () => {
      updateOptimistic({ type: "remove", id });
      await removeItem(id, listId);
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const q = qty ? parseFloat(qty.replace(",", ".")) : null;
    const quantityG = q !== null && isFinite(q) && q > 0 ? q : null;
    setName("");
    setQty("");
    setError(null);
    nameRef.current?.focus();
    startTransition(async () => {
      updateOptimistic({
        type: "add",
        item: { id: -Date.now(), name: trimmed, quantityG, unit: null, checked: false, recipeId: null },
      });
      const r = await addManualItem(listId, trimmed, quantityG);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Ajout rapide d'un article libre */}
      <form onSubmit={handleAdd} className="sh-add">
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ajouter un article…"
          aria-label="Nom de l'article"
          maxLength={200}
          className="sh-add-name"
          enterKeyHint="done"
        />
        <span className="sh-add-qty">
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Qté"
            aria-label="Quantité en grammes (facultatif)"
            inputMode="decimal"
            className="num"
          />
          <span>g</span>
        </span>
        <button
          type="submit"
          disabled={!name.trim()}
          className="fl-btn fl-btn-primary fl-btn-icon"
          aria-label="Ajouter l'article"
        >
          <Plus size={18} />
        </button>
      </form>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)", marginTop: -8 }}>
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="fl-card sh-empty">
          <ShoppingBasket size={22} />
          <p>
            La liste est vide. Ajoute une recette pour remplir la liste avec ses ingrédients, ou
            un article à la main ci-dessus.
          </p>
        </div>
      ) : (
        <>
          <div>
            <div className="sh-head">
              <h2>À acheter</h2>
              <span className="num">{todo.length}</span>
              <Help
                title="Quantités additionnées"
                calc="quantité = somme de (quantité dans la recette × coefficient), arrondie au-dessus"
                example="Tarte A : 200 g de beurre, coefficient 2. Tarte B : 100 g de beurre, coefficient 1. La liste affiche 500 g de beurre."
              >
                Un ingrédient présent dans plusieurs recettes n&apos;apparaît qu&apos;une fois : ses
                quantités sont additionnées, après multiplication par le coefficient de chaque
                recette. Les ingrédients des sous-recettes sont inclus. Pour une fourchette (min –
                max), on garde le maximum pour acheter assez.
              </Help>
              <span style={{ flex: 1 }} />
              <span className="sh-muted" style={{ fontSize: 12 }}>Unités</span>
              <Help
                title="Unités"
                example="2 pièces d'œuf et 100 g d'œuf restent sur deux lignes séparées."
              >
                On n&apos;additionne que des quantités de même unité et de même nom. Les litres sont
                convertis en grammes (1 L = 1000 g). « QS » (quantité suffisante) n&apos;a pas de quantité. Les
                articles ajoutés à la main sont en grammes ; la quantité est facultative.
              </Help>
            </div>
            {todo.length === 0 ? (
              <div className="fl-card sh-alldone">
                <Check size={18} /> Tout est dans le panier.
              </div>
            ) : (
              <div className="fl-list">
                {todo.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={handleToggle} onRemove={handleRemove} />
                ))}
              </div>
            )}
          </div>

          {done.length > 0 && (
            <div>
              <div className="sh-head">
                <h2>Dans le panier</h2>
                <span className="num">{done.length}</span>
              </div>
              <div className="fl-list sh-done">
                {done.map((item) => (
                  <ItemRow key={item.id} item={item} onToggle={handleToggle} onRemove={handleRemove} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
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
  const pending = item.id < 0;
  const showQty = item.quantityG !== null || item.unit === "QS";
  const spec = (): MenuSpec => ({
    title: item.name,
    items: [
      {
        label: item.checked ? "Décocher" : "Cocher",
        icon: item.checked ? RotateCcw : Check,
        disabled: pending,
        onSelect: () => onToggle(item.id),
      },
      { separator: true },
      { label: "Retirer de la liste", icon: Trash2, danger: true, disabled: pending, onSelect: () => onRemove(item.id) },
    ],
  });

  return (
    <ContextArea spec={spec} className="fl-row sh-item">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.checked}
        disabled={pending}
        onClick={() => onToggle(item.id)}
        className="sh-item-btn"
        data-checked={item.checked ? "true" : undefined}
      >
        <span className="sh-box" aria-hidden>
          {item.checked && <Check size={18} strokeWidth={3} />}
        </span>
        <span className="sh-item-name">
          {item.name}
          {item.recipeId === null && <small>ajouté à la main</small>}
        </span>
        {showQty && <span className="sh-item-qty num">{formatQty(item.quantityG ?? 0, item.unit)}</span>}
      </button>
      {!pending && <MoreButton spec={spec} label={`Actions pour ${item.name}`} />}
    </ContextArea>
  );
}
