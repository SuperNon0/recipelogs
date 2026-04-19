"use client";

import { useTransition } from "react";
import { deleteShoppingList } from "@/app/actions/shopping";

export function DeleteShoppingListButton({
  listId,
  listName,
}: {
  listId: number;
  listName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          confirm(
            `Supprimer définitivement la liste « ${listName} » ? Cette action est irréversible.`,
          )
        ) {
          startTransition(() => deleteShoppingList(listId));
        }
      }}
      className="fl-btn fl-btn-danger"
    >
      {pending ? "Suppression…" : "Supprimer cette liste"}
    </button>
  );
}
