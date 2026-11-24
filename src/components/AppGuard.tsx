"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { debloquerSiRienDOuvert } from "@/components/ui/overlay";
import { BUILD_ID, doitRecharger, estErreurDeVersion, rechargerUneFois } from "@/lib/appGuard";

/**
 * Garde l'appli d'aplomb sur téléphone (surtout l'appli posée sur l'écran
 * d'accueil de l'iPhone, qui reste ouverte des jours) :
 *
 * 1. Page figée : si plus aucune fenêtre n'est ouverte mais que la page est
 *    restée bloquée (plus de défilement, barre d'onglets cachée), on la débloque
 *    au changement de page, au retour dans l'appli et dès qu'on touche l'écran.
 * 2. Barre au milieu de l'écran : après le clavier ou un zoom, l'iPhone garde
 *    parfois la page décalée ; les éléments fixés (barre d'onglets) se
 *    retrouvent au milieu et la page ne défile plus. On la recale.
 * 3. Appli qui ne répond plus après une mise à jour du site : l'ancienne page
 *    réclame des morceaux qui n'existent plus. Au retour dans l'appli, on
 *    regarde si le site a changé et on recharge (tout de suite si rien n'est en
 *    cours de saisie, sinon un bandeau propose de le faire).
 */
export function AppGuard() {
  const pathname = usePathname();
  const [nouvelle, setNouvelle] = useState(false);

  // 1. Changement de page : aucune fenêtre ne doit rester « ouverte » derrière.
  useEffect(() => {
    const t = window.setTimeout(debloquerSiRienDOuvert, 300);
    return () => window.clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    const vv = window.visualViewport;

    // 2. Recale la page quand le clavier se ferme ou après un zoom.
    let attente: number | undefined;
    const recaler = () => {
      if (attente !== undefined) window.clearTimeout(attente);
      attente = window.setTimeout(() => {
        attente = undefined;
        if (!vv || Math.abs(vv.scale - 1) > 0.01) return; // zoom en cours : on laisse faire
        const champ = document.activeElement as HTMLElement | null;
        if (champ && champ.matches("input, textarea, select, [contenteditable='true']")) return; // clavier ouvert
        if (vv.offsetTop > 1 || vv.offsetLeft > 1 || window.innerHeight - vv.height > 1) {
          // Demander la même position force l'iPhone à replacer la barre d'onglets.
          window.scrollTo(window.scrollX, window.scrollY);
        }
      }, 120);
    };

    // 1 bis. On touche l'écran et la page est figée sans fenêtre : on débloque.
    const auToucher = () => {
      const b = document.body;
      if (b.style.overflow === "hidden" || b.classList.contains("verrou")) debloquerSiRienDOuvert();
    };

    // 3. Nouvelle version du site ?
    let dernier = 0;
    const verifierVersion = async () => {
      if (!BUILD_ID || Date.now() - dernier < 60_000) return;
      dernier = Date.now();
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (!build || build === BUILD_ID) return;
        if (doitRecharger(document, window.location.pathname)) rechargerUneFois();
        else setNouvelle(true);
      } catch {
        // Hors ligne ou session finie : rien à faire ici.
      }
    };

    const auRetour = () => {
      if (document.visibilityState !== "visible") return;
      debloquerSiRienDOuvert();
      recaler();
      void verifierVersion();
    };
    const pageAffichee = (e: PageTransitionEvent) => {
      if (e.persisted) auRetour();
    };

    // 3 bis. Morceau de page introuvable (site mis à jour entre-temps) : on recharge.
    const surErreur = (e: ErrorEvent) => {
      if (estErreurDeVersion(e.error ?? e.message)) rechargerUneFois();
    };
    const surRejet = (e: PromiseRejectionEvent) => {
      if (estErreurDeVersion(e.reason)) rechargerUneFois();
    };

    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("pageshow", pageAffichee);
    window.addEventListener("error", surErreur);
    window.addEventListener("unhandledrejection", surRejet);
    document.addEventListener("touchstart", auToucher, { passive: true });
    document.addEventListener("focusout", recaler);
    vv?.addEventListener("resize", recaler);
    const minuteur = window.setInterval(() => {
      if (document.visibilityState === "visible") void verifierVersion();
    }, 15 * 60 * 1000);
    return () => {
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("pageshow", pageAffichee);
      window.removeEventListener("error", surErreur);
      window.removeEventListener("unhandledrejection", surRejet);
      document.removeEventListener("touchstart", auToucher);
      document.removeEventListener("focusout", recaler);
      vv?.removeEventListener("resize", recaler);
      window.clearInterval(minuteur);
      if (attente !== undefined) window.clearTimeout(attente);
    };
  }, []);

  if (!nouvelle) return null;
  return (
    <div className="maj-dispo" role="status">
      <span>Nouvelle version du site</span>
      <button type="button" className="fl-btn fl-btn-primary" onClick={() => window.location.reload()}>
        <RefreshCw size={14} /> Recharger
      </button>
    </div>
  );
}
