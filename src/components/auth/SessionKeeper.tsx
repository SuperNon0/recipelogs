"use client";

import { useEffect } from "react";

const TOUTES_LES_MS = 60 * 60 * 1000;

/**
 * Plateforme (connexion RecipeLog) : garde la session vivante tant que le site est ouvert,
 * et renvoie vers la connexion si elle est finie (au lieu d'un refus au moment d'enregistrer).
 * Ne montre rien.
 */
export function SessionKeeper() {
  useEffect(() => {
    let dernier = 0;
    let arrete = false;
    const verifier = async () => {
      if (arrete || Date.now() - dernier < TOUTES_LES_MS) return;
      dernier = Date.now();
      try {
        const r = await fetch("/auth/renouveler", { method: "POST", cache: "no-store" });
        if (r.status === 401 && !arrete) {
          window.location.href = `/auth/connexion?retour=${encodeURIComponent(window.location.pathname + window.location.search)}`;
        }
      } catch {
        // Hors ligne : nouvel essai au prochain passage.
        dernier = 0;
      }
    };
    void verifier();
    const minuteur = window.setInterval(verifier, 5 * 60 * 1000);
    const auRetour = () => {
      if (document.visibilityState === "visible") void verifier();
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => {
      arrete = true;
      window.clearInterval(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
    };
  }, []);
  return null;
}
