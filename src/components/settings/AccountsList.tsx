"use client";

import { useTransition } from "react";
import {
  validateAccount,
  refuseAccount,
  blockAccount,
  unblockAccount,
  deleteAccount,
} from "@/app/actions/accounts";
import type { AccountRow } from "@/lib/auth/queries";

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    dateStyle: "short",
  });
}

const STATE_STYLE: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: { label: "En attente", color: "#a78bfa", bg: "rgba(167,139,250,0.15)" },
  active: { label: "Actif", color: "var(--accent-2)", bg: "rgba(79,195,161,0.15)" },
  blocked: { label: "Bloqué", color: "var(--danger)", bg: "rgba(232,92,71,0.15)" },
  refused: { label: "Refusé", color: "var(--muted)", bg: "rgba(107,111,122,0.15)" },
};

export function AccountsList({ accounts }: { accounts: AccountRow[] }) {
  const pending = accounts.filter((a) => a.state === "pending");
  const members = accounts.filter(
    (a) => a.state === "active" || a.state === "blocked",
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="fl-label mb-2" style={{ fontSize: "0.8rem" }}>
          Demandes en attente ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            Aucune demande en attente.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {pending.map((a) => (
              <PendingRow key={a.id} account={a} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="fl-label mb-2" style={{ fontSize: "0.8rem" }}>
          Membres ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">
            Aucun membre pour le moment.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {members.map((a) => (
              <MemberRow key={a.id} account={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? STATE_STYLE.pending;
  return (
    <span
      className="fl-tag"
      style={{ background: s.bg, color: s.color, borderColor: s.color }}
    >
      {s.label}
    </span>
  );
}

function PendingRow({ account }: { account: AccountRow }) {
  const [pending, start] = useTransition();
  return (
    <div
      className="flex items-center gap-3 flex-wrap py-2 px-3 rounded-md"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ color: "var(--text)" }}>{account.email ?? "—"}</div>
        <div className="fl-label" style={{ fontSize: "0.7rem" }}>
          Demandé le {fmtDate(account.createdAt)}
        </div>
      </div>
      <StateBadge state={account.state} />
      <div className="flex gap-2">
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          disabled={pending}
          onClick={() => start(() => validateAccount(account.id).then(() => undefined))}
          style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
        >
          Accepter
        </button>
        <button
          type="button"
          className="fl-btn"
          disabled={pending}
          onClick={() => start(() => refuseAccount(account.id).then(() => undefined))}
          style={{
            fontSize: "0.75rem",
            padding: "0.3rem 0.6rem",
            color: "var(--danger)",
          }}
        >
          Refuser
        </button>
      </div>
    </div>
  );
}

function MemberRow({ account }: { account: AccountRow }) {
  const [pending, start] = useTransition();
  const isBlocked = account.state === "blocked";

  function confirmDelete() {
    if (account.isBaseAdmin) {
      window.alert("Le compte administrateur de base ne peut pas être supprimé.");
      return;
    }
    if (
      !window.confirm(
        `Supprimer définitivement le compte ${account.email ?? account.id} ? Cette action est irréversible.`,
      )
    )
      return;
    start(() => deleteAccount(account.id).then(() => undefined));
  }

  return (
    <div
      className="flex items-center gap-3 flex-wrap py-2 px-3 rounded-md"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ color: "var(--text)" }}>
          {account.email ?? "—"}
          {account.isBaseAdmin && (
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
          {account.role === "super_admin" && !account.isBaseAdmin && (
            <span
              className="fl-tag ml-2"
              style={{
                background: "rgba(232,197,71,0.15)",
                color: "var(--accent)",
                borderColor: "var(--accent)",
              }}
            >
              Super-admin
            </span>
          )}
        </div>
        <div className="fl-label" style={{ fontSize: "0.7rem" }}>
          Validé le {fmtDate(account.validatedAt)} · Dernière connexion{" "}
          {fmtDate(account.lastLoginAt)}
        </div>
      </div>
      <StateBadge state={account.state} />
      <div className="flex gap-2">
        {isBlocked ? (
          <button
            type="button"
            className="fl-btn fl-btn-primary"
            disabled={pending}
            onClick={() => start(() => unblockAccount(account.id).then(() => undefined))}
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
          >
            Débloquer
          </button>
        ) : (
          <button
            type="button"
            className="fl-btn"
            disabled={pending || account.isBaseAdmin}
            title={
              account.isBaseAdmin
                ? "Le compte de base ne peut pas être bloqué"
                : undefined
            }
            onClick={() => start(() => blockAccount(account.id).then(() => undefined))}
            style={{
              fontSize: "0.75rem",
              padding: "0.3rem 0.6rem",
              color: "var(--danger)",
            }}
          >
            Bloquer
          </button>
        )}
        <button
          type="button"
          className="fl-btn"
          disabled={pending || account.isBaseAdmin}
          onClick={confirmDelete}
          title={
            account.isBaseAdmin ? "Le compte de base ne peut pas être supprimé" : undefined
          }
          style={{
            fontSize: "0.75rem",
            padding: "0.3rem 0.6rem",
            color: account.isBaseAdmin ? "var(--muted)" : "var(--danger)",
          }}
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
