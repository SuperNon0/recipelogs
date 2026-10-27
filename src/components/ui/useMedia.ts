"use client";

import { useEffect, useRef, useState } from "react";

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

/** Fenêtres ouvertes qui écoutent Échap, de la plus ancienne à la plus récente. */
const escapeStack: symbol[] = [];

/** Ferme sur Échap. Seule la fenêtre ouverte en dernier se ferme (« Renommer » sans la fenêtre Variantes derrière). */
export function useEscape(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const me = Symbol();
    escapeStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escapeStack[escapeStack.length - 1] === me) cb.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      escapeStack.splice(escapeStack.indexOf(me), 1);
    };
  }, [active]);
}
