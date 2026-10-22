"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Photo d'une recette. Si le fichier n'existe plus sur le serveur, on affiche
 * `fallback` (la vignette de couleur) au lieu de l'icône d'image cassée.
 */
export function Photo({
  src,
  className,
  fallback = null,
}: {
  src: string;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [broken, setBroken] = useState(false);
  // L'erreur a pu arriver avant l'hydratation (onError jamais appelé).
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setBroken(true);
  }, []);
  if (broken) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt="" loading="lazy" className={className} onError={() => setBroken(true)} />
  );
}
