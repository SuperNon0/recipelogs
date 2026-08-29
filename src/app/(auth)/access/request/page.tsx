"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { requestAccess } from "@/app/actions/accounts";

export default function RequestAccessPage() {
  return (
    <Suspense fallback={<div className="fl-card">Chargement…</div>}>
      <RequestAccessInner />
    </Suspense>
  );
}

function RequestAccessInner() {
  const sp = useSearchParams();
  const email = sp.get("email") ?? "";
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(fd: FormData) {
    setError(null);
    fd.set("email", email);
    start(async () => {
      const r = await requestAccess(fd);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="fl-card flex flex-col gap-4">
      <div>
        <h1 className="fl-title-serif" style={{ fontSize: "1.5rem" }}>
          Bienvenue !
        </h1>
        <p className="fl-label mt-1">
          Cloudflare a autorisé ton e-mail à atteindre le site, mais tu
          n'as pas encore de compte ici. Fais une demande d'accès —
          l'administrateur la validera.
        </p>
      </div>

      {email && (
        <div
          className="fl-input"
          style={{
            background: "var(--surface)",
            padding: "0.6rem 0.85rem",
          }}
        >
          <span className="fl-label">E-mail :</span>{" "}
          <span style={{ color: "var(--text)" }}>{email}</span>
        </div>
      )}

      <form action={onSubmit} className="flex flex-col gap-3">
        {error && (
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="fl-btn fl-btn-primary"
          disabled={pending}
        >
          {pending ? "Envoi…" : "Demander un accès"}
        </button>
      </form>
    </div>
  );
}
