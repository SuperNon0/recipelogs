"use client";

import { useState, useTransition } from "react";
import { triggerDeploy, clearDeployLock } from "@/app/actions/admin";
import { MaintenanceOverlay } from "./MaintenanceOverlay";

type DeployError = { message: string; hint?: string };

export function DeployButton() {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [overlayBootedAt, setOverlayBootedAt] = useState<number | null>(null);
  const [error, setError] = useState<DeployError | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await triggerDeploy();
      if (result.ok) {
        setOverlayBootedAt(result.bootedAt);
        setConfirm(false);
      } else {
        setError({ message: result.error, hint: result.hint });
      }
    });
  }

  async function handleUnlock() {
    setUnlocking(true);
    const r = await clearDeployLock();
    setUnlocking(false);
    if (r.ok) {
      setError(null);
    } else {
      setError({ message: r.error });
    }
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
          className="flex flex-col gap-2 text-sm"
          style={{
            color: "var(--danger)",
            padding: "10px 14px",
            background: "rgba(232, 92, 71, 0.08)",
            border: "1px solid var(--danger)",
            borderRadius: 8,
          }}
        >
          <div>⚠️ {error.message}</div>
          {error.hint && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                background: "var(--bg)",
                color: "var(--text)",
                padding: 8,
                borderRadius: 6,
                lineHeight: 1.4,
                overflow: "auto",
              }}
            >
              {error.hint}
            </pre>
          )}
          {error.message.toLowerCase().includes("en cours") && (
            <button
              type="button"
              onClick={handleUnlock}
              disabled={unlocking}
              className="fl-btn fl-btn-secondary self-start"
              style={{ fontSize: "0.75rem" }}
            >
              {unlocking ? "Déblocage…" : "🔓 Forcer le déblocage du lock"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
