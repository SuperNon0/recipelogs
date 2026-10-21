"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ShoppingBasket } from "lucide-react";
import { addCookbookRecipesToList } from "@/app/actions/shopping";
import { fetchShoppingListsForModal } from "@/app/actions/modals";
import { ModalOverlay } from "./ModalOverlay";
import { Help } from "./ui/Help";

type ListOption = { id: number; name: string };

/** Bouton « Courses » : ajoute toutes les recettes du cahier à une liste. */
export function AddCookbookToShoppingListButton({
  cookbookId,
  cookbookName,
  recipeCount,
  className = "fl-btn fl-btn-secondary",
}: {
  cookbookId: number;
  cookbookName: string;
  recipeCount: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={recipeCount === 0}
        className={className}
        title={recipeCount === 0 ? "Aucune recette dans ce cahier" : undefined}
      >
        <ShoppingBasket size={16} /> Courses
      </button>
      {open && (
        <AddCookbookToShoppingListDialog
          cookbookId={cookbookId}
          cookbookName={cookbookName}
          recipeCount={recipeCount}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

/** Fenêtre « Ajouter aux courses » (nouvelle liste ou liste existante). */
export function AddCookbookToShoppingListDialog({
  cookbookId,
  cookbookName,
  recipeCount,
  onClose,
}: {
  cookbookId: number;
  cookbookName: string;
  recipeCount: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState(`Courses ${cookbookName}`);
  const [lists, setLists] = useState<ListOption[] | null>(null);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);

  useEffect(() => {
    fetchShoppingListsForModal().then(setLists);
  }, []);

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const r = await addCookbookRecipesToList(
        cookbookId,
        mode === "existing" ? selectedListId : null,
        mode === "new" ? newName : null,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
      router.push(`/shopping/${r.listId}`);
    });
  }

  const title = (
    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <ShoppingBasket size={18} style={{ color: "var(--accent)" }} /> Ajouter aux courses
    </span>
  );

  return (
    <ModalOverlay onClose={onClose} title={title}>
      <p style={{ color: "var(--soft)", marginTop: -4, display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {recipeCount} recette{recipeCount > 1 ? "s" : ""} du cahier « {cookbookName} »
        <Help title="Ajout aux courses">
          Les ingrédients de toutes les recettes du cahier sont ajoutés à la liste. Les ingrédients
          identiques sont regroupés et leurs quantités additionnées. Une recette figée compte avec sa
          masse figée.
        </Help>
      </p>

      {lists && lists.length > 0 && (
        <div className="fl-seg" style={{ alignSelf: "flex-start" }}>
          <button type="button" aria-pressed={mode === "new"} onClick={() => setMode("new")}>
            Nouvelle liste
          </button>
          <button type="button" aria-pressed={mode === "existing"} onClick={() => setMode("existing")}>
            Liste existante
          </button>
        </div>
      )}

      {mode === "new" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <span className="fl-label">Nom de la nouvelle liste</span>
          <input
            className="fl-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex. commande du lundi"
            maxLength={200}
            autoFocus
          />
        </label>
      )}

      {mode === "existing" && lists && (
        <div className="fl-list fl-scroll" style={{ maxHeight: 260, overflowY: "auto", background: "var(--bg)" }}>
          {lists.map((l, i) => {
            const on = selectedListId === l.id;
            return (
              <button
                key={l.id}
                type="button"
                className="fl-row"
                aria-pressed={on}
                onClick={() => setSelectedListId(l.id)}
                style={{
                  width: "100%",
                  background: on ? "var(--accent-dim)" : "transparent",
                  border: "none",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  color: on ? "var(--accent)" : "var(--text)",
                  textAlign: "left",
                  minHeight: 44,
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {l.name}
                </span>
                {on && <Check size={16} />}
              </button>
            );
          })}
        </div>
      )}

      {lists === null && <p style={{ color: "var(--muted)", fontSize: 13 }}>Chargement des listes…</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" onClick={onClose} disabled={pending} className="fl-btn fl-btn-secondary">
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={
            pending ||
            recipeCount === 0 ||
            (mode === "new" && !newName.trim()) ||
            (mode === "existing" && !selectedListId)
          }
          className="fl-btn fl-btn-primary"
        >
          {pending ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </ModalOverlay>
  );
}
