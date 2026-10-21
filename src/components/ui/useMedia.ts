"use client";

import { useEffect, useState } from "react";

/** Vrai quand l'écran est un téléphone (menus et aides en feuille du bas). */
export const PHONE_QUERY = "(max-width: 699px)";

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** Ferme sur Échap. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}
