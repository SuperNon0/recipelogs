"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  deleteRecipe,
  duplicateRecipe,
  toggleFavorite,
} from "@/app/actions/recipes";

export function RecipeActions({
  recipeId,
  favorite,
}: {
  recipeId: number;
  favorite: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
        className="fl-btn fl-btn-secondary"
        style={{ padding: "0.5rem 0.75rem" }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            style={{ background: "transparent" }}
          />
          <div
            className="absolute right-0 mt-2 z-50 min-w-[220px] flex flex-col"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 6,
              boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
            }}
          >
            <MenuLink href={`/recipes/${recipeId}/edit`}>Éditer</MenuLink>
            <MenuButton
              onClick={() =>
                startTransition(() => {
                  setOpen(false);
                  toggleFavorite(recipeId);
                })
              }
            >
              {favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            </MenuButton>
            <MenuButton
              onClick={() =>
                startTransition(() => {
                  setOpen(false);
                  duplicateRecipe(recipeId);
                })
              }
            >
              Dupliquer
            </MenuButton>
            <MenuButton
              danger
              onClick={() => {
                if (
                  confirm(
                    "Supprimer définitivement cette recette ? Cette action est irréversible.",
                  )
                ) {
                  startTransition(() => {
                    setOpen(false);
                    deleteRecipe(recipeId);
                  });
                }
              }}
            >
              Supprimer
            </MenuButton>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded-md hover:bg-[color:var(--border)] text-sm"
    >
      {children}
    </Link>
  );
}

function MenuButton({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-2 rounded-md hover:bg-[color:var(--border)] text-sm text-left"
      style={{ color: danger ? "var(--danger)" : undefined }}
    >
      {children}
    </button>
  );
}
