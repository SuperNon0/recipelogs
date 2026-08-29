"use client";

import { useState, useTransition } from "react";
import { addSuperAdmin, removeSuperAdmin } from "@/app/actions/accounts";
import type { AccountRow } from "@/lib/auth/queries";

export function SuperAdminsSection({ accounts }: { accounts: AccountRow[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const superAdmins = accounts.filter(
    (a) => a.role === "super_admin" && a.state === "active",
  );

  function onAdd(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await addSuperAdmin(fd);
      if (r.ok) setShowAdd(false);
      else setError(r.error);
    });
  }

  function confirmRemove(a: AccountRow) {
    if (a.isBaseAdmin) {
      window.alert("Le compte administrateur de base ne peut pas être retiré.");
      return;
    }
    if (
      !window.confirm(
        `Retirer le rôle super-admin à ${a.email ?? a.id} ? Il redeviendra membre.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const r = await removeSuperAdmin(a.id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {superAdmins.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">
          Aucun super-admin (état incohérent — vérifie la BDD).
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {superAdmins.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 flex-wrap py-2 px-3 rounded-md"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div style={{ color: "var(--text)" }}>
                  {a.email ?? "—"}
                  {a.isBaseAdmin && (
                    <span
                      className="fl-tag ml-2"
                      style={{
                        background: "rgba(232,197,71,0.15)",
                        color: "var(--accent)",
                        borderColor: "var(--accent)",
                      }}
                    >
                      Compte de base
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="fl-btn"
                disabled={pending || a.isBaseAdmin}
                onClick={() => confirmRemove(a)}
                title={
                  a.isBaseAdmin
                    ? "Le compte de base ne peut pas être retiré"
                    : undefined
                }
                style={{
                  fontSize: "0.75rem",
                  padding: "0.3rem 0.6rem",
                  color: a.isBaseAdmin ? "var(--muted)" : "var(--danger)",
                }}
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {showAdd ? (
        <form action={onAdd} className="flex items-center gap-2 flex-wrap">
          <input
            type="email"
            name="email"
            required
            placeholder="email@exemple.com"
            className="fl-input flex-1 min-w-[200px]"
            style={{ fontSize: "0.9rem" }}
            autoFocus
          />
          <button
            type="submit"
            className="fl-btn fl-btn-primary"
            disabled={pending}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}
          >
            {pending ? "…" : "Ajouter"}
          </button>
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            onClick={() => setShowAdd(false)}
            style={{ fontSize: "0.8rem", padding: "0.35rem 0.7rem" }}
          >
            Annuler
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="fl-btn fl-btn-secondary self-start"
          style={{ fontSize: "0.8rem" }}
        >
          + Ajouter un super-admin (par email)
        </button>
      )}
    </div>
  );
}
