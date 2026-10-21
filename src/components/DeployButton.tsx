"use client";

import { useState, useTransition } from "react";
import { CircleAlert, LockOpen, RefreshCw } from "lucide-react";
import { triggerDeploy, clearDeployLock } from "@/app/actions/admin";
import { ModalOverlay } from "./ModalOverlay";
import { MaintenanceOverlay } from "./MaintenanceOverlay";

type DeployError = { message: string; hint?: string };

/**
 * Bouton « Mettre à jour » : ouvre une fenêtre de confirmation, lance le
 * script de déploiement puis affiche le suivi plein écran.
 */
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

  const close = () => {
    if (pending) return;
    setConfirm(false);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirm(true);
        }}
        className="fl-btn fl-btn-secondary"
        aria-label="Mettre à jour le site"
      >
        <RefreshCw size={15} />
        <span className="set-hide-phone">Mettre à jour</span>
      </button>

      {confirm && (
        <ModalOverlay title="Mettre à jour le site" onClose={close}>
          <p style={{ color: "var(--soft)", fontSize: 14 }}>
            Le serveur récupère la dernière version sur GitHub, l&apos;installe et la prépare, puis
            redémarre le site. Compte quelques minutes : le site reste utilisable pendant la
            préparation, puis est coupé une dizaine de secondes au redémarrage. En cas de problème,
            l&apos;ancienne version est conservée.
          </p>
          <p className="set-note">Ne ferme pas la page pendant l&apos;opération.</p>

          {error && (
            <div className="set-alert" style={{ flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 10 }}>
                <CircleAlert size={16} style={{ flex: "none", marginTop: 1 }} />
                <span>{error.message}</span>
              </div>
              {error.hint && <pre className="set-code set-code-wrap" style={{ width: "100%" }}>{error.hint}</pre>}
              {error.message.toLowerCase().includes("en cours") && (
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={unlocking}
                  className="fl-btn fl-btn-secondary"
                >
                  <LockOpen size={15} />
                  {unlocking ? "Déblocage…" : "Forcer le déblocage"}
                </button>
              )}
            </div>
          )}

          <div className="set-foot">
            <button type="button" onClick={close} disabled={pending} className="fl-btn fl-btn-secondary">
              Annuler
            </button>
            <button type="button" onClick={handleClick} disabled={pending} className="fl-btn fl-btn-primary">
              <RefreshCw size={15} className={pending ? "set-spin" : undefined} />
              {pending ? "Démarrage…" : "Oui, lancer la mise à jour"}
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  );
}
