"use client";

import { useState, useTransition } from "react";
import { addRecipeToCookbook } from "@/app/actions/cookbooks";
import { ModalOverlay } from "./RecipeBody";

type Cookbook = { id: number; name: string };

export function AddToCookbookButton({
  recipeId,
  cookbooks,
}: {
  recipeId: number;
  cookbooks: Cookbook[];
}) {
  const [open, setOpen] = useState(false);

  if (cookbooks.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fl-btn fl-btn-secondary"
        style={{ fontSize: "0.8rem" }}
      >
        📒 Ajouter au cahier
      </button>
      {open && (
        <AddToCookbookModal
          recipeId={recipeId}
          cookbooks={cookbooks}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function AddToCookbookModal({
  recipeId,
  cookbooks,
  onClose,
}: {
  recipeId: number;
  cookbooks: Cookbook[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [cookbookId, setCookbookId] = useState(cookbooks[0]?.id ?? 0);
  const [linkMode, setLinkMode] = useState<"linked" | "snapshot">("linked");
  const [subrecipeMode, setSubrecipeMode] = useState<"single" | "separate">("single");
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addRecipeToCookbook(
        cookbookId,
        recipeId,
        linkMode,
        subrecipeMode,
      );
      if (result.ok) {
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="flex flex-col gap-5" style={{ minWidth: 320 }}>
        <h2 className="fl-title-serif" style={{ fontSize: "1.2rem" }}>
          Ajouter au cahier
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Cahier</span>
          <select
            value={cookbookId}
            onChange={(e) => setCookbookId(Number(e.target.value))}
            className="fl-input"
          >
            {cookbooks.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Mode de liaison</span>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="linkMode"
                value="linked"
                checked={linkMode === "linked"}
                onChange={() => setLinkMode("linked")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm">🔗 Liée</div>
                <div className="fl-label" style={{ fontWeight: 400 }}>
                  Toujours à jour avec la recette courante
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="linkMode"
                value="snapshot"
                checked={linkMode === "snapshot"}
                onChange={() => setLinkMode("snapshot")}
                className="mt-0.5"
              />
              <div>
                <div className="text-sm">📌 Figée</div>
                <div className="fl-label" style={{ fontWeight: 400 }}>
                  Capture la recette telle qu'elle est aujourd'hui
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="fl-label">Sous-recettes dans le PDF</span>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="subrecipeMode"
                value="single"
                checked={subrecipeMode === "single"}
                onChange={() => setSubrecipeMode("single")}
              />
              <span className="text-sm">📄 Fiche unique</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="subrecipeMode"
                value="separate"
                checked={subrecipeMode === "separate"}
                onChange={() => setSubrecipeMode("separate")}
              />
              <span className="text-sm">📚 Séparées</span>
            </label>
          </div>
        </div>

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
