"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "starting" | "deploying" | "restarting" | "done" | "failed";

const PHASES: { key: Phase; label: string }[] = [
  { key: "starting", label: "Démarrage du déploiement…" },
  { key: "deploying", label: "Mise à jour en cours (git, build)…" },
  { key: "restarting", label: "Redémarrage du service…" },
  { key: "done", label: "Mise à jour terminée ✓" },
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
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

    async function poll() {
      if (cancelled) return;

      // 1. Tente de récupérer le log + statut
      try {
        const logRes = await fetch("/api/deploy/log", { cache: "no-store" });
        if (logRes.ok) {
          const data = await logRes.json();
          if (data.log) setLog(data.log);

          // Heuristique : on regarde la fin du log pour savoir où on en est
          const tail = (data.log as string).slice(-1000).toLowerCase();
          if (tail.includes("redémarrage du service")) setPhase("restarting");
          else if (tail.includes("build next.js") || tail.includes("pnpm install")) setPhase("deploying");
          else if (tail.includes("==> [")) setPhase("deploying");
          if (tail.includes("erreur") || tail.includes("error")) {
            // Pas forcément fatal mais on alerte
          }
        }
      } catch {
        // Le serveur est probablement en train de redémarrer → on continue à poller
      }

      // 2. Tente /api/health pour détecter le redémarrage
      try {
        const healthRes = await fetch("/api/health", { cache: "no-store" });
        if (healthRes.ok) {
          const h = await healthRes.json();
          if (typeof h.bootedAt === "number" && h.bootedAt > initialBootedAt) {
            // Le serveur a redémarré avec une nouvelle instance !
            setPhase("done");
            setTimeout(() => {
              window.location.reload();
            }, 1200);
            return;
          }
        }
      } catch {
        // Server peut être en train de redémarrer → silencieux
      }

      // 3. Timeout de sécurité : 5 min
      if (Date.now() - startedAt.current > 5 * 60 * 1000) {
        setError(
          "Délai dépassé (5 min). La mise à jour a peut-être échoué — consulte les logs.",
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 15, 17, 0.96)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: "100%",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 24,
          color: "var(--text)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
            🔧 Mise à jour en cours
          </h2>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: "0.8rem",
              color: "var(--muted)",
            }}
          >
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        </div>

        {/* Barre de progression */}
        <div
          style={{
            height: 8,
            background: "var(--border)",
            borderRadius: 4,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: "100%",
              background:
                phase === "done"
                  ? "var(--accent-2)"
                  : phase === "failed"
                    ? "var(--danger)"
                    : "var(--accent)",
              transition: "width 600ms ease-out",
            }}
          />
        </div>

        {/* Phase courante */}
        <div className="flex flex-col gap-1">
          {PHASES.map((p) => {
            const reached =
              PHASES.findIndex((x) => x.key === phase) >= PHASES.findIndex((x) => x.key === p.key);
            const current = p.key === phase;
            return (
              <div
                key={p.key}
                style={{
                  fontSize: "0.85rem",
                  color: reached ? "var(--text)" : "var(--muted)",
                  fontWeight: current ? 600 : 400,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: reached ? "var(--accent)" : "transparent",
                    border: reached ? "none" : "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                />
                {p.label}
              </div>
            );
          })}
        </div>

        {error && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: "rgba(232, 92, 71, 0.1)",
              border: "1px solid var(--danger)",
              color: "var(--danger)",
              fontSize: "0.85rem",
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Logs */}
        {log && (
          <details>
            <summary
              style={{
                cursor: "pointer",
                fontSize: "0.8rem",
                color: "var(--muted)",
              }}
            >
              📋 Voir les logs
            </summary>
            <pre
              style={{
                background: "var(--bg)",
                padding: 10,
                marginTop: 8,
                borderRadius: 6,
                fontSize: "0.7rem",
                lineHeight: 1.4,
                overflow: "auto",
                maxHeight: 240,
                whiteSpace: "pre-wrap",
                color: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              {log}
            </pre>
          </details>
        )}

        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--muted)",
            textAlign: "center",
          }}
        >
          {phase === "done"
            ? "Rechargement de la page…"
            : "Ne ferme pas cette fenêtre. Le site se rechargera automatiquement."}
        </p>

        {error && (
          <button
            type="button"
            onClick={onCancel}
            className="fl-btn fl-btn-secondary"
          >
            Fermer
          </button>
        )}
      </div>
    </div>
  );
}
