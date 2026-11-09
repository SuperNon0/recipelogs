"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { clearRecipeHistory } from "@/app/actions/history";

/** Vide l'historique des recettes ouvertes, après confirmation. */
export function ClearHistoryButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="fl-btn fl-btn-ghost"
      disabled={pending}
      onClick={() => {
        if (confirm("Vider l'historique ? Les recettes ne sont pas touchées.")) start(() => clearRecipeHistory());
      }}
    >
      <Trash2 size={16} /> Vider
    </button>
  );
}
