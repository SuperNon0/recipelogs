"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eraser, Trash2 } from "lucide-react";
import { deleteIngredientBasesBulk } from "@/app/actions/settings";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";

type Orphan = { id: number; name: string };

/**
 * Rangée « Ingrédients sans recette » : supprime tous les ingrédients qui ne
 * sont plus utilisés dans aucune recette. Un clic ouvre une fenêtre qui liste
 * précisément ce qui va être supprimé avant confirmation.
 */
export function DeleteOrphanIngredientsButton({ orphans }: { orphans: Orphan[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const count = orphans.length;

  function handleConfirm() {
    if (count === 0) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteIngredientBasesBulk(orphans.map((o) => o.id));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="fl-row">
      <span className="ic">
        <Eraser size={16} />
      </span>
      <span className="set-tx">
        <b>
          <span>Ingrédients sans recette</span>
          <Help title="Ingrédients sans recette">
            Des ingrédients restent dans la base alors qu&apos;aucune recette ne les utilise plus
            (recette supprimée, ingrédient renommé à la main…). Les retirer allège les propositions
            pendant la saisie. Tu vois la liste avant de confirmer ; les recettes ne sont pas
            modifiées.
          </Help>
        </b>
        <small>
          {count === 0
            ? "Aucun pour le moment"
            : `${count} ingrédient${count > 1 ? "s" : ""} inutilisé${count > 1 ? "s" : ""} à nettoyer`}
        </small>
      </span>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={count === 0}
        className="fl-btn fl-btn-secondary"
      >
        Nettoyer
      </button>

      {open && (
        <ModalOverlay title="Supprimer les ingrédients sans recette" onClose={() => !pending && setOpen(false)}>
          <p style={{ color: "var(--soft)" }}>
            {count} ingrédient{count > 1 ? "s" : ""} ne {count > 1 ? "sont" : "est"} plus
            utilisé{count > 1 ? "s" : ""} dans aucune recette et {count > 1 ? "seront" : "sera"}{" "}
            supprimé{count > 1 ? "s" : ""} de la base. Les recettes ne sont pas modifiées.
          </p>
          <div className="fl-list fl-scroll" style={{ maxHeight: 320, overflowY: "auto", flex: "none" }}>
            {orphans.map((o) => (
              <div key={o.id} className="fl-row" style={{ minHeight: 40, padding: "8px 14px" }}>
                {o.name}
              </div>
            ))}
          </div>
          {error && <p className="set-error">{error}</p>}
          <div className="set-foot">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className="fl-btn fl-btn-secondary">
              Annuler
            </button>
            <button type="button" onClick={handleConfirm} disabled={pending || count === 0} className="fl-btn fl-btn-danger">
              <Trash2 size={15} />
              {pending ? "Suppression…" : `Supprimer ${count} ingrédient${count > 1 ? "s" : ""}`}
            </button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}
