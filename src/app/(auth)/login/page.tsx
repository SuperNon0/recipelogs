"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { loginLocal } from "@/app/actions/accounts";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await loginLocal(fd);
      if (!r.ok) setError(r.error);
      // Sur succès, l'action redirect elle-même.
    });
  }

  return (
    <div className="fl-card flex flex-col gap-4">
      <div>
        <h1 className="fl-title-serif" style={{ fontSize: "1.5rem" }}>
          Connexion administrateur
        </h1>
        <p className="fl-label mt-1">
          Accès en local (LAN) par mot de passe.
        </p>
      </div>

      <form action={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="fl-label">Mot de passe</span>
          <input
            type="password"
            name="password"
            required
            autoComplete="current-password"
            autoFocus
            className="fl-input"
          />
        </label>

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
          {pending ? "Connexion…" : "Se connecter"}
        </button>

        <Link
          href="/access/forgot-password"
          className="fl-label text-center hover:text-[color:var(--text)]"
          style={{ fontSize: "0.75rem" }}
        >
          Mot de passe oublié ?
        </Link>
      </form>
    </div>
  );
}
