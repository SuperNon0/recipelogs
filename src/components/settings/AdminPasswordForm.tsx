"use client";

import { useState, useTransition } from "react";
import { changeAdminPassword } from "@/app/actions/accounts";

export function AdminPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function onSubmit(fd: FormData) {
    setError(null);
    setOk(false);
    const newPwd = String(fd.get("newPassword") ?? "");
    const confirm = String(fd.get("confirmPassword") ?? "");
    if (newPwd !== confirm) {
      setError("La confirmation ne correspond pas.");
      return;
    }
    start(async () => {
      const r = await changeAdminPassword(fd);
      if (r.ok) {
        setOk(true);
        (document.getElementById("adminPwdForm") as HTMLFormElement)?.reset();
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <form
      id="adminPwdForm"
      action={onSubmit}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Mot de passe actuel</span>
        <input
          type="password"
          name="currentPassword"
          required
          autoComplete="current-password"
          className="fl-input"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Nouveau mot de passe (min 8 caractères)</span>
        <input
          type="password"
          name="newPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="fl-input"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="fl-label">Confirmer le nouveau mot de passe</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className="fl-input"
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
      {ok && (
        <p className="text-sm" style={{ color: "var(--accent-2)" }}>
          ✓ Mot de passe changé.
        </p>
      )}

      <div>
        <button
          type="submit"
          className="fl-btn fl-btn-primary"
          disabled={pending}
        >
          {pending ? "Enregistrement…" : "Changer le mot de passe"}
        </button>
      </div>
    </form>
  );
}
