"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteCookbook } from "@/app/actions/cookbooks";
import { demander } from "@/components/ui/demander";

/** Demande confirmation puis supprime le cahier (les recettes sont conservées). */
export async function confirmDeleteCookbook(cookbookName: string): Promise<boolean> {
  return await demander(
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
      onClick={async () => {
        if (await confirmDeleteCookbook(cookbookName)) startTransition(() => deleteCookbook(cookbookId));
      }}
      className="fl-btn fl-btn-danger"
    >
      <Trash2 size={16} /> {pending ? "Suppression…" : "Supprimer le cahier"}
    </button>
  );
}
