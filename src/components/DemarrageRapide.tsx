"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { doitRecharger, rechargerUneFois } from "@/lib/appGuard";

/** Message envoyé à AppGuard quand la copie affichée vient d'une ancienne version. */
export const EVENEMENT_NOUVELLE_VERSION = "recipelog:nouvelle-version";

type Reponse = { type: "recipelog-demarrage"; copie: boolean; resultat?: "a-jour" | "nouvelle-version" | "deconnecte" | "hors-ligne" };

/**
 * Démarrage rapide de l'appli (surtout sur iPhone, qui ferme les applis de
 * l'écran d'accueil) : installe public/sw.js, qui garde l'interface et la
 * dernière page d'accueil sur l'appareil.
 *
 * Quand l'accueil vient d'être affiché depuis cette copie, on demande au
 * service worker ce qu'a répondu le serveur entre-temps :
 * - « a-jour » : on rafraîchit les données de la page, sans la recharger ;
 * - « nouvelle-version » : le site a été mis à jour, son nouveau code est déjà
 *   téléchargé ; AppGuard recharge (ou propose de le faire) comme d'habitude ;
 * - « deconnecte » : la session est finie, on recharge pour repasser par la
 *   connexion (la copie est déjà effacée).
 *
 * actif=false (RECIPELOG_DEMARRAGE_RAPIDE_OFF=1 sur le serveur) : retire le
 * service worker et ses copies, l'appli redevient comme avant.
 */
export function DemarrageRapide({ actif }: { actif: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    const sw = navigator.serviceWorker;

    if (!actif) {
      void sw.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
      if ("caches" in window) {
        void caches.keys().then((noms) => noms.filter((n) => n.startsWith("rl-")).forEach((n) => void caches.delete(n)));
      }
      return;
    }

    const surMessage = (e: MessageEvent<Reponse>) => {
      const m = e.data;
      if (!m || m.type !== "recipelog-demarrage" || !m.copie) return;
      if (m.resultat === "a-jour") router.refresh();
      else if (m.resultat === "deconnecte") rechargerUneFois();
      else if (m.resultat === "nouvelle-version") {
        if (doitRecharger(document, window.location.pathname)) rechargerUneFois();
        else window.dispatchEvent(new Event(EVENEMENT_NOUVELLE_VERSION));
      }
    };
    sw.addEventListener("message", surMessage);

    // La page vient-elle de la copie ? (seulement si le service worker la sert)
    sw.controller?.postMessage({ type: "etat", chemin: window.location.pathname });

    // Installé après l'affichage, pour ne rien ralentir au premier lancement.
    const installer = () => void sw.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if (document.readyState === "complete") installer();
    else window.addEventListener("load", installer, { once: true });

    return () => {
      sw.removeEventListener("message", surMessage);
      window.removeEventListener("load", installer);
    };
  }, [actif, router]);

  return null;
}
