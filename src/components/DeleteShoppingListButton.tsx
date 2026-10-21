"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteShoppingList } from "@/app/actions/shopping";
import type { MenuAction } from "@/components/ui/Menu";

/**
 * Action de menu « Supprimer la liste… » (avec confirmation).
 * Utilisée dans le menu des lignes de la page des listes et dans l'en-tête
 * d'une liste. L'action serveur renvoie ensuite vers /shopping.
 */
export function useDeleteShoppingList(listId: number, listName: string): MenuAction {
  const [pending, startTransition] = useTransition();
  return {
    label: pending ? "Suppression…" : "Supprimer la liste…",
    icon: Trash2,
    danger: true,
    disabled: pending,
    onSelect: () => {
      if (confirm(`Supprimer définitivement la liste « ${listName} » ? Cette action est irréversible.`)) {
        startTransition(() => deleteShoppingList(listId));
      }
    },
  };
}

/** Télécharge le PDF de la liste (la route répond en pièce jointe). */
export function downloadShoppingListPdf(listId: number) {
  window.location.href = `/shopping/${listId}/pdf`;
}
