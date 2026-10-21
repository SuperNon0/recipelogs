"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ExternalLink, FileDown, ListX, RotateCcw, ShoppingBasket } from "lucide-react";
import { ContextArea, MoreButton, type MenuSpec } from "@/components/ui/Menu";
import { removeChecked, uncheckAll } from "@/app/actions/shopping";
import { downloadShoppingListPdf, useDeleteShoppingList } from "./DeleteShoppingListButton";

export type ShoppingListRowData = {
  id: number;
  name: string;
  recipeNames: string[];
  total: number;
  checked: number;
};

/**
 * Ligne de la page des listes : clic pour ouvrir, « ⋯ » / clic droit /
 * appui long pour le menu (Ouvrir, PDF, Supprimer).
 */
export function ShoppingListRow({ list }: { list: ShoppingListRowData }) {
  const del = useDeleteShoppingList(list.id, list.name);
  const pdf = { label: "Télécharger le PDF", icon: FileDown, onSelect: () => downloadShoppingListPdf(list.id) };
  const open = { label: "Ouvrir", icon: ExternalLink, href: `/shopping/${list.id}` };
  const sub = list.recipeNames.length > 0 ? list.recipeNames.join(", ") : "Aucune recette";
  const spec = (): MenuSpec => ({
    title: list.name,
    icon: ShoppingBasket,
    items: [open, pdf, { separator: true }, del],
  });
  const done = list.total > 0 && list.checked === list.total;

  return (
    <ContextArea spec={spec} className="fl-row sh-lrow">
      <Link href={`/shopping/${list.id}`} className="sh-lrow-link">
        <span className="ic" data-done={done ? "true" : undefined}>
          <ShoppingBasket size={16} />
        </span>
        <span className="sh-lrow-name">
          <b>{list.name}</b>
          <small>{sub}</small>
        </span>
        <span className="sh-lrow-count num">
          {list.total === 0 ? (
            "vide"
          ) : (
            <>
              {list.checked > 0 && `${list.checked}/`}
              {list.total} article{list.total > 1 ? "s" : ""}
            </>
          )}
          {list.total > 0 && (
            <span className="sh-progress" aria-hidden>
              <span style={{ width: `${(list.checked / list.total) * 100}%` }} />
            </span>
          )}
        </span>
      </Link>
      <MoreButton spec={spec} label={`Actions pour ${list.name}`} />
    </ContextArea>
  );
}

/** Menu « ⋯ » de l'en-tête d'une liste : actions groupées, PDF, suppression. */
export function ShoppingListHeaderMenu({
  listId,
  listName,
  checked,
}: {
  listId: number;
  listName: string;
  checked: number;
}) {
  const [, startTransition] = useTransition();
  const del = useDeleteShoppingList(listId, listName);
  const spec = (): MenuSpec => ({
    title: listName,
    icon: ShoppingBasket,
    items: [
      {
        label: "Tout décocher",
        icon: RotateCcw,
        disabled: checked === 0,
        onSelect: () => startTransition(async () => { await uncheckAll(listId); }),
      },
      {
        label: checked > 0 ? `Retirer les cochés (${checked})` : "Retirer les cochés",
        icon: ListX,
        disabled: checked === 0,
        onSelect: () => {
          if (confirm(`Retirer ${checked} article${checked > 1 ? "s" : ""} coché${checked > 1 ? "s" : ""} de la liste ?`)) {
            startTransition(async () => { await removeChecked(listId); });
          }
        },
      },
      { separator: true },
      {
        label: "Télécharger le PDF",
        icon: FileDown,
        onSelect: () => downloadShoppingListPdf(listId),
      },
      { separator: true },
      del,
    ],
  });
  return (
    <MoreButton
      spec={spec}
      label="Actions de la liste"
      horizontal
      className="fl-btn fl-btn-secondary fl-btn-icon"
    />
  );
}
