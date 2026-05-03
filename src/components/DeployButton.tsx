"use client";

import { useState, useTransition } from "react";
import { triggerDeploy } from "@/app/actions/admin";
import { MaintenanceOverlay } from "./MaintenanceOverlay";

export function DeployButton() {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [overlayBootedAt, setOverlayBootedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await triggerDeploy();
      if (result.ok) {
        setOverlayBootedAt(result.bootedAt);
        setConfirm(false);
      } else {
        setError(result.error);
      }
    });
  }

  if (overlayBootedAt !== null) {
    return (
      <MaintenanceOverlay
        initialBootedAt={overlayBootedAt}
        onCancel={() => setOverlayBootedAt(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-[color:var(--muted)]">
        Lance le script <code>deploy.sh</code> sur le serveur :
        <code> git pull</code> → <code>install</code> → <code>build</code> → redémarrage
        automatique du service. Ne ferme pas la page pendant l&apos;opération.
      </p>

      {!confirm ? (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="fl-btn fl-btn-primary self-start"
          style={{ fontSize: "0.85rem" }}
        >
          🚀 Mettre à jour le site
        </button>
      ) : (
        <div className="flex flex-col gap-2 fl-card" style={{ borderColor: "var(--accent)" }}>
          <p className="text-sm">
            <strong>⚠️ Confirmation</strong> — Le site sera indisponible ~30-90 secondes
            pendant le redémarrage. Continuer ?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClick}
              disabled={pending}
              className="fl-btn fl-btn-primary"
              style={{ fontSize: "0.85rem" }}
            >
              {pending ? "Démarrage…" : "Oui, lancer"}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              disabled={pending}
              className="fl-btn fl-btn-secondary"
              style={{ fontSize: "0.85rem" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="text-sm"
          style={{
            color: "var(--danger)",
            padding: "8px 12px",
            background: "rgba(232, 92, 71, 0.08)",
            border: "1px solid var(--danger)",
            borderRadius: 8,
          }}
        >
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}
