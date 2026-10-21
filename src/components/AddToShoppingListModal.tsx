"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ShoppingBasket } from "lucide-react";
import { addRecipeToList } from "@/app/actions/shopping";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";
import { fetchShoppingListsForModal } from "@/app/actions/modals";

type ShoppingList = { id: number; name: string };

/** Fenêtre « Ajouter aux courses » : charge les listes puis ajoute la recette. */
export function AddToShoppingListDialog({
  recipeId,
  recipeName,
  onClose,
}: {
  recipeId: number;
  recipeName?: string;
  onClose: () => void;
}) {
  const [lists, setLists] = useState<ShoppingList[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [listId, setListId] = useState(0);
  const [coef, setCoef] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchShoppingListsForModal().then((l) => {
      setLists(l);
      setListId(l[0]?.id ?? 0);
    });
  }, []);

  function handleAdd() {
    const c = parseFloat(coef.replace(",", "."));
    if (isNaN(c) || c <= 0) {
      setError("Le coefficient doit être un nombre positif.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addRecipeToList(listId, recipeId, c);
      if (result.ok) {
        setDone(true);
        setTimeout(onClose, 700);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <ModalOverlay
      onClose={onClose}
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ShoppingBasket size={18} style={{ color: "var(--accent)" }} /> Ajouter aux courses
        </span>
      }
    >
      {recipeName && <p style={{ color: "var(--muted)", marginTop: -6 }}>{recipeName}</p>}
      {lists === null ? (
        <p style={{ color: "var(--muted)" }}>Chargement…</p>
      ) : lists.length === 0 ? (
        <>
          <p style={{ color: "var(--soft)" }}>
            Aucune liste de courses pour le moment. Crée d&apos;abord une liste dans la section Courses.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Fermer</button>
            <Link href="/shopping/new" className="fl-btn fl-btn-primary" onClick={onClose}>Créer une liste</Link>
          </div>
        </>
      ) : (
        <>
          <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="fl-label">Liste</span>
            <select value={listId} onChange={(e) => setListId(Number(e.target.value))} className="fl-input">
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <span className="fl-label" style={{ display: "flex", alignItems: "center" }}>
              Coefficient
              <Help title="Coefficient" calc="quantité ajoutée = quantité de la recette × coefficient" example="2 = le double de chaque ingrédient ; 0,5 = la moitié.">
                Multiplie toutes les quantités de la recette avant de les ajouter à la liste.
                Les ingrédients déjà présents sont additionnés.
              </Help>
            </span>
            <input type="number" min="0.01" step="0.01" inputMode="decimal" value={coef} onChange={(e) => setCoef(e.target.value)} className="fl-input" />
          </div>
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} className="fl-btn fl-btn-secondary">Annuler</button>
            <button type="button" onClick={handleAdd} disabled={pending || done} className="fl-btn fl-btn-primary">
              {done ? <><Check size={16} /> Ajoutée</> : pending ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </>
      )}
    </ModalOverlay>
  );
}
