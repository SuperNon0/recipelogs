"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, CircleAlert, Loader, ScrollText, Wrench } from "lucide-react";
import { deploySteps, isRestartStep } from "@/lib/deployLog";

type Phase = "starting" | "deploying" | "restarting" | "done" | "failed";

const PHASES: { key: Phase; label: string }[] = [
  { key: "starting", label: "Démarrage du déploiement…" },
  { key: "deploying", label: "Préparation de la nouvelle version…" },
  { key: "restarting", label: "Redémarrage du service…" },
  { key: "done", label: "Mise à jour terminée" },
];

export function MaintenanceOverlay({
  initialBootedAt,
  onCancel,
}: {
  initialBootedAt: number;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [log, setLog] = useState<string>("");
  const [step, setStep] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [upToDate, setUpToDate] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;

    let bootChangedAt: number | null = null;
    // Dernière étape annoncée par deploy.sh (gardée quand le serveur redémarre).
    let lastStep = "";

    const finish = (next: Phase) => {
      setPhase(next);
      if (next === "done") setTimeout(() => { window.location.href = "/"; }, 1500);
    };

    async function poll() {
      if (cancelled) return;

      // 1. Log du script (le fichier ne contient que le déploiement en cours).
      let tail = "";
      try {
        const logRes = await fetch("/api/deploy/log", { cache: "no-store" });
        if (logRes.ok) {
          const data = await logRes.json();
          if (data.log) setLog(data.log);
          const full = String(data.log ?? "");
          tail = full.slice(-2000).toLowerCase();
          const steps = deploySteps(full);
          if (steps.length) {
            lastStep = steps[steps.length - 1];
            setStep(lastStep.replace(/^\[\d\d:\d\d:\d\d\]\s*/, ""));
          }
        }
      } catch {
        // Le serveur est probablement en train de redémarrer → on continue à poller
      }

      // Marqueurs écrits par deploy.sh
      if (tail.includes("échec du déploiement")) {
        setPhase("failed");
        setError(
          tail.includes("retour automatique")
            ? "La nouvelle version ne démarrait pas : retour automatique à la version précédente. Le site fonctionne toujours."
            : "La mise à jour a échoué. Le site n'a pas été modifié et fonctionne toujours. Détails dans les logs ci-dessous.",
        );
        return;
      }
      if (tail.includes("déjà à jour")) {
        setUpToDate(true);
        finish("done");
        return;
      }
      if (tail.includes("déploiement terminé")) {
        finish("done");
        return;
      }
      const restarting = isRestartStep(lastStep);
      if (lastStep) setPhase(restarting ? "restarting" : "deploying");

      // 2. Redémarrage détecté sans marqueur de fin (anciennes versions du
      //    script) : on considère la mise à jour terminée après 60 s. Pas si
      //    le script a repris une autre étape après le redémarrage (build sur
      //    le serveur quand la version de GitHub ne démarre pas).
      const mayBeOver = restarting || !lastStep;
      if (!mayBeOver) bootChangedAt = null;
      try {
        const healthRes = await fetch("/api/health", { cache: "no-store" });
        if (healthRes.ok) {
          const h = await healthRes.json();
          if (mayBeOver && typeof h.bootedAt === "number" && h.bootedAt > initialBootedAt) {
            bootChangedAt ??= Date.now();
            if (Date.now() - bootChangedAt > 60_000) {
              finish("done");
              return;
            }
          }
        }
      } catch {
        // Serveur en cours de redémarrage → silencieux
      }

      // 3. Timeout de sécurité : 60 min. Quand le serveur construit lui-même
      //    le site (disque lent), le build seul a déjà pris plus de 20 min.
      if (Date.now() - startedAt.current > 60 * 60 * 1000) {
        setError(
          "Délai dépassé (60 min). La mise à jour a peut-être échoué — consulte les logs.",
        );
        return;
      }

      timeout = setTimeout(poll, 2000);
    }

    poll();

    return () => {
      cancelled = true;
      clearTimeout(timeout!);
    };
  }, [initialBootedAt]);

  const progress = phase === "done" ? 100 : phase === "restarting" ? 80 : phase === "deploying" ? 50 : 15;
  const phaseIndex = PHASES.findIndex((x) => x.key === phase);

  // Rendu dans <body> pour couvrir toute la page, quel que soit le parent.
  return createPortal(
    <div className="set-maint" role="dialog" aria-modal="true" aria-label="Mise à jour en cours">
      <div className="set-maint-box">
        <div className="modal-head">
          <h3 style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Wrench size={18} style={{ color: "var(--accent)" }} />
            {phase === "done" ? "Mise à jour terminée" : "Mise à jour en cours"}
          </h3>
          <span className="num" style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--muted)" }}>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        </div>

        {/* Barre de progression */}
        <div className="set-progress">
          <div
            style={{
              width: `${progress}%`,
              background:
                phase === "done"
                  ? "var(--accent-2)"
                  : phase === "failed"
                    ? "var(--danger)"
                    : "var(--accent)",
            }}
          />
        </div>

        {/* Étapes */}
        <div className="set-steps">
          {PHASES.map((p, i) => {
            const reached = phaseIndex >= i;
            const current = p.key === phase;
            return (
              <div
                key={p.key}
                className="set-step"
                data-reached={reached ? "true" : undefined}
                data-current={current ? "true" : undefined}
              >
                <span className="set-step-dot">
                  {current && phase !== "done" && !error ? (
                    <Loader size={12} className="set-spin" />
                  ) : reached ? (
                    <Check size={12} strokeWidth={3} />
                  ) : null}
                </span>
                {p.label}
              </div>
            );
          })}
        </div>

        {step && phase !== "done" && !error && (
          <p className="set-note" style={{ marginTop: 0 }}>
            {step}
          </p>
        )}

        {error && (
          <div className="set-alert">
            <CircleAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Journal */}
        {log && (
          <details className="set-details">
            <summary>
              <ScrollText size={14} /> Voir le journal
            </summary>
            <pre className="set-code set-code-wrap" style={{ marginTop: 8, maxHeight: 240, overflow: "auto", fontSize: 11 }}>
              {log}
            </pre>
          </details>
        )}

        <p className="set-note" style={{ textAlign: "center" }}>
          {phase === "done"
            ? upToDate
              ? "Le site était déjà à jour. Redirection vers l'accueil…"
              : "Redirection vers l'accueil…"
            : "Ne ferme pas cette fenêtre. Le site se rechargera automatiquement."}
        </p>

        {error && (
          <div className="set-foot">
            <button type="button" onClick={onCancel} className="fl-btn fl-btn-secondary">
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
