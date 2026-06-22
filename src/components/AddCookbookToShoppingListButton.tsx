"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCookbookRecipesToList } from "@/app/actions/shopping";
import { fetchShoppingListsForModal } from "@/app/actions/modals";

type ListOption = { id: number; name: string };

export function AddCookbookToShoppingListButton({
  cookbookId,
  cookbookName,
  recipeCount,
}: {
  cookbookId: number;
  cookbookName: string;
  recipeCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [newName, setNewName] = useState("");
  const [lists, setLists] = useState<ListOption[]>([]);
  const [selectedListId, setSelectedListId] = useState<number | null>(null);
  const [loadingLists, setLoadingLists] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewName(`Courses — ${cookbookName}`);
    setError(null);
    setLoadingLists(true);
    fetchShoppingListsForModal().then((result) => {
      setLists(result);
      setLoadingLists(false);
      if (result.length === 0) setMode("new");
    });
  }, [open, cookbookName]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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
      setOpen(false);
      router.push(`/shopping/${r.listId}`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={recipeCount === 0}
        className="fl-btn fl-btn-secondary"
        style={{
          fontSize: "0.8rem",
          opacity: recipeCount === 0 ? 0.5 : 1,
        }}
        title={
          recipeCount === 0
            ? "Aucune recette dans ce cahier"
            : `Ajouter les ${recipeCount} recette${recipeCount > 1 ? "s" : ""} à une liste de courses`
        }
      >
        🛒 Liste de courses
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fl-card"
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="fl-title-serif" style={{ fontSize: "1.1rem" }}>
                🛒 Ajouter à une liste de courses
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="fl-label hover:text-[color:var(--text)]"
                style={{ fontSize: "0.8rem" }}
              >
                ✕
              </button>
            </div>

            <p className="fl-label" style={{ color: "var(--muted)" }}>
              {recipeCount} recette{recipeCount > 1 ? "s" : ""} du cahier «&nbsp;{cookbookName}&nbsp;»
              {recipeCount > 1 ? " seront ajoutées" : " sera ajoutée"} à la liste.
              Les ingrédients similaires seront regroupés.
            </p>

            {/* Toggle new / existing */}
            {lists.length > 0 && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("new")}
                  className="fl-btn"
                  style={{
                    flex: 1,
                    fontSize: "0.8rem",
                    background: mode === "new" ? "var(--accent)" : "transparent",
                    color: mode === "new" ? "var(--bg)" : "var(--text)",
                    borderColor: mode === "new" ? "var(--accent)" : "var(--border)",
                  }}
                >
                  Nouvelle liste
                </button>
                <button
                  type="button"
                  onClick={() => setMode("existing")}
                  className="fl-btn"
                  style={{
                    flex: 1,
                    fontSize: "0.8rem",
                    background: mode === "existing" ? "var(--accent)" : "transparent",
                    color: mode === "existing" ? "var(--bg)" : "var(--text)",
                    borderColor: mode === "existing" ? "var(--accent)" : "var(--border)",
                  }}
                >
                  Liste existante
                </button>
              </div>
            )}

            {mode === "new" && (
              <label className="flex flex-col gap-1.5">
                <span className="fl-label" style={{ fontSize: "0.82rem" }}>
                  Nom de la nouvelle liste
                </span>
                <input
                  className="fl-input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex : Commande du lundi"
                  maxLength={200}
                  autoFocus
                />
              </label>
            )}

            {mode === "existing" && (
              <div className="flex flex-col gap-1.5">
                <span className="fl-label" style={{ fontSize: "0.82rem" }}>
                  Choisir une liste
                </span>
                {loadingLists ? (
                  <p className="fl-label" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                    Chargement…
                  </p>
                ) : (
                  <div
                    className="flex flex-col rounded-md"
                    style={{
                      border: "1px solid var(--border)",
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                  >
                    {lists.map((l, idx) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => setSelectedListId(l.id)}
                        className="px-3 py-2 text-sm text-left"
                        style={{
                          color: "var(--text)",
                          background:
                            selectedListId === l.id
                              ? "rgba(232,197,71,0.12)"
                              : "transparent",
                          borderTop:
                            idx === 0 ? "none" : "1px solid var(--border)",
                          cursor: "pointer",
                          fontWeight: selectedListId === l.id ? 600 : 400,
                        }}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="fl-btn"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  pending ||
                  (mode === "new" && !newName.trim()) ||
                  (mode === "existing" && !selectedListId)
                }
                className="fl-btn fl-btn-primary"
                style={{ opacity: pending ? 0.6 : 1 }}
              >
                {pending ? "Ajout en cours…" : "🛒 Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
