"use client";

import { LogoutButton } from "@/components/LogoutButton";

export default function PendingPage() {
  return (
    <div className="fl-card flex flex-col gap-4 items-center text-center">
      <h1 className="fl-title-serif" style={{ fontSize: "1.5rem" }}>
        Demande en attente
      </h1>
      <p className="fl-label" style={{ color: "var(--text)" }}>
        Ta demande d'accès a bien été envoyée.
        Un administrateur doit la valider avant que tu puisses entrer.
      </p>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          onClick={() => window.location.reload()}
        >
          Rafraîchir
        </button>
        <LogoutButton />
      </div>
    </div>
  );
}
