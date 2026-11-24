"use client";

import { useEffect } from "react";
import { estErreurDeVersion, rechargerUneFois } from "@/lib/appGuard";

/**
 * Dernier filet : une erreur dans la mise en page elle-même (menu, barres)
 * laissait l'appli blanche ou figée jusqu'à la relancer. On propose de
 * recharger, et on le fait tout seul si la page date d'avant une mise à jour.
 */
export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    if (estErreurDeVersion(error)) rechargerUneFois();
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#141210", color: "#f3efe8" }}>
        <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 20px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22 }}>RecipeLog ne répond plus</h1>
          <p style={{ opacity: 0.8, lineHeight: 1.5 }}>
            Un souci est survenu. Recharge la page : rien de ce qui était enregistré n&apos;est perdu.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: "12px 22px", fontSize: 16, borderRadius: 12, border: 0, background: "#e0a64b", color: "#141210", fontWeight: 600 }}
          >
            Recharger la page
          </button>
        </div>
      </body>
    </html>
  );
}
