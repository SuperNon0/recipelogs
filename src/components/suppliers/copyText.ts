import { useEffect, useState } from "react";

/** Copie un texte dans le presse-papiers ; repli pour les navigateurs sans API (site en http, vieux iPhone). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* repli ci-dessous */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.fontSize = "16px";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Le bouton « Envoyer… » (partage du téléphone) n'existe que si le navigateur sait partager. */
export function useCanShare(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  return ok;
}
