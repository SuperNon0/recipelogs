"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Filet de sécurité : une action refusée (rôle sans la permission) ou une
 * erreur imprévue affiche ce message au lieu d'une page blanche. En ligne,
 * Next.js ne transmet pas le texte de l'erreur : on reste donc général.
 */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="access-card" style={{ margin: "40px auto" }}>
      <div className="access-icon" style={{ color: "var(--pending)" }}>
        <ShieldAlert size={28} strokeWidth={1.6} />
      </div>
      <h1>Action impossible</h1>
      <p className="access-text">
        Ça n&apos;a pas marché. Si ton rôle ne permet pas cette action, demande à un administrateur ;
        sinon, réessaie dans un instant.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={reset}>
          Réessayer
        </button>
        <Link href="/" className="fl-btn fl-btn-primary">
          Retour aux recettes
        </Link>
      </div>
    </div>
  );
}
