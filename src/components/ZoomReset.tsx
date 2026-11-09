"use client";

import { useEffect } from "react";

/**
 * Téléphone : le zoom au pincement ne dure que le temps du geste.
 * Dès que les doigts quittent l'écran, la page revient à sa taille normale.
 *
 * L'iPhone n'offre pas de commande pour « dézoomer » : on ajoute un instant
 * maximum-scale=1 à la balise viewport (ce qui ramène la page à 1×), puis on
 * remet la balise d'origine pour que le pincement suivant marche encore.
 */
export function ZoomReset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !window.matchMedia("(pointer: coarse)").matches) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta) return;

    let timer: number | undefined;
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0 || vv.scale <= 1.01 || timer !== undefined) return;
      const original = meta.content;
      meta.content = `${original.replace(/,?\s*maximum-scale=[^,]*/g, "")}, maximum-scale=1`;
      timer = window.setTimeout(() => {
        meta.content = original;
        timer = undefined;
      }, 400);
    };

    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
