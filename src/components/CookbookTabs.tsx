"use client";

import { useState, type ReactNode } from "react";

type TabKey = "recipes" | "apparence";

/** Onglets d'un cahier : contenu (recettes, chapitres) et mise en page. */
export function CookbookTabs({
  recipes,
  apparence,
  recipeCount,
}: {
  recipes: ReactNode;
  apparence: ReactNode;
  recipeCount: number;
}) {
  const [tab, setTab] = useState<TabKey>("recipes");

  return (
    <div>
      <div className="fl-tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" role="tab" aria-selected={tab === "recipes"} onClick={() => setTab("recipes")}>
          Recettes · {recipeCount}
        </button>
        <button type="button" role="tab" aria-selected={tab === "apparence"} onClick={() => setTab("apparence")}>
          Mise en page
        </button>
      </div>

      <div role="tabpanel">{tab === "recipes" ? recipes : apparence}</div>
    </div>
  );
}
