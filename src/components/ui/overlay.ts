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

/**
 * Page derrière une fenêtre figée (pas de défilement), avec un compteur.
 *
 * Avant, chaque fenêtre notait l'état d'avant (« prev ») et le remettait en se
 * fermant. Deux fenêtres l'une dans l'autre qui se ferment ensemble (une
 * confirmation dans une fenêtre, un changement de page) se referment parent
 * d'abord : la fenêtre du dessus remettait alors « figé » après coup, et la
 * page ne défilait plus du tout jusqu'à relancer l'appli. Avec le compteur, la
 * page redéfile dès que la dernière fenêtre est fermée, dans n'importe quel ordre.
 */
let verrous = 0;

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    verrous += 1;
    document.body.style.overflow = "hidden";
    return () => {
      verrous = Math.max(0, verrous - 1);
      if (verrous === 0) document.body.style.overflow = "";
    };
  }, [active]);
}

/**
 * Filet de sécurité (AppGuard) : si plus aucune fenêtre n'est affichée, la page
 * ne doit être ni figée ni sans barre d'onglets. Remet tout d'aplomb sinon.
 * Renvoie vrai si quelque chose était resté bloqué.
 */
export function debloquerSiRienDOuvert(): boolean {
  if (typeof document === "undefined") return false;
  const body = document.body;
  const fenetre = document.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"], .voile, .modal-veil, .sheet-veil, .feuille, .lab');
  if (fenetre) return false;
  let bloque = false;
  if (body.style.overflow === "hidden") {
    body.style.overflow = "";
    verrous = 0;
    bloque = true;
  }
  if (body.classList.contains("verrou")) {
    body.classList.remove("verrou");
    bloque = true;
  }
  if (body.classList.contains("overlay-ouvert")) {
    body.classList.remove("overlay-ouvert");
    ouvertes = 0;
    bloque = true;
  }
  return bloque;
}
