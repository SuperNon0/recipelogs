"use client";

import { useEffect } from "react";
import { recordRecipeView } from "@/app/actions/history";

/**
 * Note l'ouverture de la fiche dans l'historique, une fois affichée à l'écran
 * (pas pendant un préchargement de lien). Ne rend rien.
 */
export function RecordRecipeView({ recipeId }: { recipeId: number }) {
  useEffect(() => {
    recordRecipeView(recipeId).catch(() => {});
  }, [recipeId]);
  return null;
}
