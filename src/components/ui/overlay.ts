"use client";

import { useEffect } from "react";

/**
 * Design « encre » : tant qu'une feuille, une fenêtre ou un menu est ouvert,
 * la barre d'onglets flottante se cache (classe « overlay-ouvert » sur <body>,
 * voir encre.css). Un compteur gère les fenêtres ouvertes l'une sur l'autre.
 * N'a aucun effet sur le fonctionnement : seulement l'apparence.
 */
let ouvertes = 0;

export function useOverlayOpen(active: boolean) {
  useEffect(() => {
    if (!active) return;
    ouvertes += 1;
    document.body.classList.add("overlay-ouvert");
    return () => {
      ouvertes = Math.max(0, ouvertes - 1);
      if (ouvertes === 0) document.body.classList.remove("overlay-ouvert");
    };
  }, [active]);
}
