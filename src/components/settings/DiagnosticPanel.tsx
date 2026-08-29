"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";

type CheckResult = { ok: boolean; message?: string };
type Diag = {
  db: CheckResult;
  cf: CheckResult;
  session: { email: string | null; role: string | null };
};

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-md"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          background: ok ? "var(--accent-2)" : "var(--danger)",
          color: "var(--bg)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon
          name={ok ? "Check" : "X"}
          size={14}
          style={{ color: "var(--bg)" }}
          strokeWidth={2.5}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div style={{ color: "var(--text)" }}>{label}</div>
        {detail && (
          <div
            className="fl-label"
            style={{ fontSize: "0.7rem", whiteSpace: "pre-wrap" }}
          >
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}

export function DiagnosticPanel() {
  const [data, setData] = useState<Diag | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    setError(null);
    start(async () => {
      try {
        const res = await fetch("/api/diagnostic", { cache: "no-store" });
        if (!res.ok) {
          setError(`Erreur ${res.status}`);
          return;
        }
        const json = (await res.json()) as Diag;
        setData(json);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur réseau");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          disabled={pending}
          onClick={refresh}
        >
          {pending ? "Vérification…" : data ? "Rafraîchir" : "Lancer le diagnostic"}
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-2">
          <StatusRow
            label="Base de données PostgreSQL"
            ok={data.db.ok}
            detail={data.db.message}
          />
          <StatusRow
            label="Cloudflare Access (clés publiques + JWT)"
            ok={data.cf.ok}
            detail={data.cf.message}
          />
          <StatusRow
            label="Session actuelle"
            ok={!!data.session.email}
            detail={
              data.session.email
                ? `${data.session.email} · ${data.session.role}`
                : "Aucune session"
            }
          />
        </div>
      )}
    </div>
  );
}
