"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCookbook } from "@/app/actions/cookbooks";

/** Demande confirmation puis supprime le cahier (les recettes sont conservées). */
export function confirmDeleteCookbook(cookbookName: string): boolean {
  return confirm(
    `Supprimer définitivement le cahier « ${cookbookName} » ? Les recettes elles-mêmes ne sont pas supprimées.`,
  );
}

export function DeleteCookbookButton({
  cookbookId,
  cookbookName,
}: {
  cookbookId: number;
  cookbookName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (confirmDeleteCookbook(cookbookName)) startTransition(() => deleteCookbook(cookbookId));
      }}
      className="fl-btn fl-btn-danger"
    >
      <Trash2 size={16} /> {pending ? "Suppression…" : "Supprimer le cahier"}
    </button>
  );
}
