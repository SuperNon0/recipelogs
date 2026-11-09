"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Eye, History, KeyRound, Pencil, Plus, Power, Shield, Trash2, UserCheck, Users, X } from "lucide-react";
import {
  approveAccount,
  deleteAccount,
  deleteRole,
  disableAccounts,
  enableAccounts,
  refuseAccount,
  saveCloudflareSettings,
  saveRole,
  setAccountBlocked,
  setAccountRole,
  startViewAs,
  testCloudflare,
} from "@/app/actions/accounts";
import type { ActionResult } from "@/lib/actionResult";
import { PERMISSIONS, permissionGroups, STATUS_LABEL } from "@/lib/auth/permissions";
import { ModalOverlay } from "@/components/ModalOverlay";
import { Help } from "@/components/ui/Help";

export type RoleInfo = { id: number; name: string; isAdmin: boolean; permissions: string[]; accounts: number };
export type AccountInfo = {
  id: number;
  email: string;
  roleId: number | null;
  status: keyof typeof STATUS_LABEL;
  createdAt: string;
  lastSeenAt: string | null;
  isMe: boolean;
};
export type AuditInfo = { id: number; at: string; text: string; detail: string | null };

const DAY = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });
const DAY_TIME = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });

/** Réglages → Comptes : connexion Cloudflare, demandes, comptes, rôles et journal. */
export function AccountsManager({
  enabled,
  forcedOff,
  team,
  aud,
  roles,
  accounts,
  log,
}: {
  enabled: boolean;
  forcedOff: boolean;
  team: string;
  aud: string;
  roles: RoleInfo[];
  accounts: AccountInfo[];
  log: AuditInfo[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RoleInfo | "new" | null>(null);

  /** Lance une action, affiche son erreur éventuelle et recharge la page. */
  const run = (fn: () => Promise<ActionResult>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    start(async () => {
      try {
        const r = await fn();
        if (!r.ok) setError(r.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
      router.refresh();
    });
  };

  const defaultRole = roles.find((r) => !r.isAdmin) ?? roles[0];
  const requests = accounts.filter((a) => a.status === "pending");
  const members = accounts.filter((a) => a.status === "active" || a.status === "blocked");
  const refused = accounts.filter((a) => a.status === "refused");
  const roleName = (id: number | null) => roles.find((r) => r.id === id)?.name ?? "Sans rôle";

  return (
    <>
      <Connection enabled={enabled} forcedOff={forcedOff} team={team} aud={aud} run={run} pending={pending} />

      {error && <p className="acct-msg err" role="alert">{error}</p>}

      <div className="sect-title">
        <h2>Demandes en attente</h2>
        <span className="acct-count">{requests.length}</span>
      </div>
      {requests.length === 0 ? (
        <p className="set-note">Aucune demande. Une personne autorisée dans Cloudflare qui arrive sur le site pour la première fois apparaît ici.</p>
      ) : (
        <div className="fl-list">
          {requests.map((a) => (
            <RequestRow key={a.id} account={a} roles={roles} defaultRoleId={defaultRole?.id} run={run} pending={pending} />
          ))}
        </div>
      )}

      <div className="sect-title">
        <h2>Comptes</h2>
        <span className="acct-count">{members.length}</span>
      </div>
      {members.length === 0 ? (
        <p className="set-note">Aucun compte pour l&apos;instant : le tien est créé quand tu actives les comptes.</p>
      ) : (
        <div className="fl-list">
          {members.map((a) => (
            <div key={a.id} className="fl-row acct-row">
              <span className="acct-av">{a.email[0]}</span>
              <span className="acct-main">
                <span className="acct-mail">
                  {a.email}
                  {a.isMe && " (toi)"}
                </span>
                <span className="acct-sub">
                  {a.status === "blocked" ? "Bloqué · " : ""}
                  {a.lastSeenAt ? `Vu le ${DAY_TIME.format(new Date(a.lastSeenAt))}` : "Jamais venu"}
                </span>
              </span>
              <span className="acct-actions">
                <select
                  className="acct-select"
                  aria-label={`Rôle de ${a.email}`}
                  value={a.roleId ?? ""}
                  disabled={pending || a.isMe}
                  title={a.isMe ? "Tu ne peux pas changer ton propre rôle" : undefined}
                  onChange={(e) => run(() => setAccountRole(a.id, Number(e.target.value)))}
                >
                  {a.roleId === null && <option value="">Sans rôle</option>}
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {!a.isMe && (
                  <>
                    {a.status === "active" && !roles.find((r) => r.id === a.roleId)?.isAdmin && a.roleId !== null && (
                      <button
                        type="button"
                        className="fl-btn fl-btn-secondary"
                        disabled={pending || !enabled}
                        title={enabled ? `Voir le site avec les permissions de ${roleName(a.roleId)}` : "Active d'abord les comptes"}
                        onClick={() =>
                          run(async () => {
                            const r = await startViewAs(a.id);
                            if (r.ok) window.location.href = "/";
                            return r;
                          })
                        }
                      >
                        <Eye size={14} /> Voir comme
                      </button>
                    )}
                    <button
                      type="button"
                      className="fl-btn fl-btn-secondary"
                      disabled={pending}
                      onClick={() =>
                        a.status === "blocked"
                          ? run(() => setAccountBlocked(a.id, false))
                          : run(() => setAccountBlocked(a.id, true), `Bloquer ${a.email} ? Il ne pourra plus entrer tant que tu ne le débloques pas.`)
                      }
                    >
                      {a.status === "blocked" ? <UserCheck size={14} /> : <Ban size={14} />}
                      {a.status === "blocked" ? "Débloquer" : "Bloquer"}
                    </button>
                    <button
                      type="button"
                      className="fl-btn fl-btn-danger fl-btn-icon"
                      aria-label={`Supprimer ${a.email}`}
                      title="Supprimer"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => deleteAccount(a.id),
                          `Supprimer le compte de ${a.email} ? S'il revient, il devra redemander un accès.`,
                        )
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {refused.length > 0 && (
        <>
          <div className="sect-title">
            <h2>Demandes refusées</h2>
            <span className="acct-count">{refused.length}</span>
          </div>
          <div className="fl-list">
            {refused.map((a) => (
              <RequestRow key={a.id} account={a} roles={roles} defaultRoleId={defaultRole?.id} run={run} pending={pending} refused />
            ))}
          </div>
        </>
      )}

      <div className="sect-title">
        <h2>Rôles</h2>
        <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setEditing("new")}>
          <Plus size={14} /> Nouveau rôle
        </button>
      </div>
      <div className="fl-list">
        {roles.map((r) => (
          <div key={r.id} className="fl-row acct-row">
            <span className="acct-av">{r.isAdmin ? <Shield size={16} /> : <KeyRound size={16} />}</span>
            <span className="acct-main">
              <span className="acct-mail">{r.name}</span>
              <span className="acct-sub">
                {r.isAdmin ? "Toutes les permissions" : `${r.permissions.length} permission${r.permissions.length > 1 ? "s" : ""} sur ${PERMISSIONS.length}`}
                {" · "}
                {r.accounts} compte{r.accounts > 1 ? "s" : ""}
              </span>
            </span>
            {!r.isAdmin && (
              <span className="acct-actions">
                <button type="button" className="fl-btn fl-btn-secondary" onClick={() => setEditing(r)}>
                  <Pencil size={14} /> Modifier
                </button>
                <button
                  type="button"
                  className="fl-btn fl-btn-danger fl-btn-icon"
                  aria-label={`Supprimer le rôle ${r.name}`}
                  title="Supprimer"
                  disabled={pending}
                  onClick={() => run(() => deleteRole(r.id), `Supprimer le rôle « ${r.name} » ?`)}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>
      {roles.length <= 1 && (
        <p className="set-note">Crée un rôle (Apprenti, Chef…) et coche ce qu&apos;il permet ; tu le donnes ensuite aux comptes.</p>
      )}

      <div className="sect-title">
        <h2>Journal</h2>
      </div>
      {log.length === 0 ? (
        <p className="set-note">Rien pour l&apos;instant.</p>
      ) : (
        <div className="fl-card acct-log">
          {log.map((l) => (
            <div key={l.id}>
              <History size={12} style={{ display: "inline", marginRight: 6, color: "var(--muted)" }} />
              <time>{DAY_TIME.format(new Date(l.at))}</time>
              {l.text}
              {l.detail && <span style={{ color: "var(--muted)" }}> ({l.detail})</span>}
            </div>
          ))}
        </div>
      )}

      {editing && <RoleEditor role={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RequestRow({
  account: a,
  roles,
  defaultRoleId,
  run,
  pending,
  refused,
}: {
  account: AccountInfo;
  roles: RoleInfo[];
  defaultRoleId: number | undefined;
  run: (fn: () => Promise<ActionResult>, confirmText?: string) => void;
  pending: boolean;
  refused?: boolean;
}) {
  const [roleId, setRoleId] = useState<number | undefined>(defaultRoleId);
  return (
    <div className="fl-row acct-row">
      <span className="acct-av">{a.email[0]}</span>
      <span className="acct-main">
        <span className="acct-mail">{a.email}</span>
        <span className="acct-sub">Demande du {DAY.format(new Date(a.createdAt))}</span>
      </span>
      <span className="acct-actions">
        <select
          className="acct-select"
          aria-label="Rôle à donner"
          value={roleId ?? ""}
          onChange={(e) => setRoleId(Number(e.target.value))}
        >
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="fl-btn fl-btn-primary"
          disabled={pending || roleId === undefined}
          onClick={() => roleId !== undefined && run(() => approveAccount(a.id, roleId))}
        >
          <Check size={14} /> Accepter
        </button>
        {refused ? (
          <button
            type="button"
            className="fl-btn fl-btn-danger fl-btn-icon"
            aria-label={`Supprimer ${a.email}`}
            disabled={pending}
            onClick={() => run(() => deleteAccount(a.id), `Effacer la demande de ${a.email} ? S'il revient, il pourra redemander un accès.`)}
          >
            <Trash2 size={14} />
          </button>
        ) : (
          <button type="button" className="fl-btn fl-btn-secondary" disabled={pending} onClick={() => run(() => refuseAccount(a.id))}>
            <X size={14} /> Refuser
          </button>
        )}
      </span>
    </div>
  );
}

/** Connexion Cloudflare (équipe + AUD), test, activation des comptes. */
function Connection({
  enabled,
  forcedOff,
  team: initialTeam,
  aud: initialAud,
  run,
  pending,
}: {
  enabled: boolean;
  forcedOff: boolean;
  team: string;
  aud: string;
  run: (fn: () => Promise<ActionResult>, confirmText?: string) => void;
  pending: boolean;
}) {
  const [team, setTeam] = useState(initialTeam);
  const [aud, setAud] = useState(initialAud);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, startTest] = useTransition();
  const saved = team.trim() === initialTeam && aud.trim() === initialAud && !!initialTeam && !!initialAud;

  return (
    <>
      <div className="sect-title" style={{ marginTop: 0 }}>
        <h2>Connexion</h2>
      </div>
      <div className="acct-card">
        <p className="acct-msg" style={{ color: enabled ? "var(--accent-2)" : "var(--soft)" }}>
          <Users size={14} style={{ display: "inline", marginRight: 6 }} />
          {enabled
            ? "Comptes activés : chaque personne doit être acceptée, et ne fait que ce que son rôle permet."
            : forcedOff
              ? "Comptes coupés par le serveur (RECIPELOG_AUTH_OFF=1 dans le .env) : tout le monde a tous les droits."
              : "Comptes désactivés : toute personne autorisée par Cloudflare a tous les droits, comme avant."}
        </p>
        <label>
          <span>
            Équipe Cloudflare{" "}
            <Help title="Équipe Cloudflare">
              Le nom de ton équipe Zero Trust. Dans Cloudflare Zero Trust → Réglages (Settings) → Team name and
              domain, c&apos;est le début de l&apos;adresse « <b>monequipe</b>.cloudflareaccess.com ». Tu peux coller
              l&apos;adresse entière.
            </Help>
          </span>
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="monequipe" autoCapitalize="none" spellCheck={false} />
        </label>
        <label>
          <span>
            AUD de l&apos;application{" "}
            <Help title="AUD de l'application">
              L&apos;identifiant de l&apos;application RecipeLog dans Cloudflare. Dans Zero Trust → Access →
              Applications → RecipeLog → Configurer (Overview), copie « Application Audience (AUD) Tag » : une
              longue suite de lettres et de chiffres. Il permet de vérifier que chaque visiteur est bien passé par
              Cloudflare : sans lui, quelqu&apos;un sur le réseau local pourrait se faire passer pour toi.
            </Help>
          </span>
          <input value={aud} onChange={(e) => setAud(e.target.value)} placeholder="4f3a…" autoCapitalize="none" spellCheck={false} />
        </label>
        {test && <p className={`acct-msg ${test.ok ? "ok" : "err"}`}>{test.text}</p>}
        <div className="acct-actions">
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            disabled={testing || !team.trim() || !aud.trim()}
            onClick={() =>
              startTest(async () => {
                try {
                  const r = await testCloudflare(team, aud);
                  setTest(
                    r.ok
                      ? { ok: true, text: `Ça marche : Cloudflare t'a reconnu comme ${r.email}.` }
                      : { ok: false, text: `Échec : ${r.error}` },
                  );
                } catch (e) {
                  setTest({ ok: false, text: e instanceof Error ? e.message : String(e) });
                }
              })
            }
          >
            {testing ? "Test…" : "Tester"}
          </button>
          <button
            type="button"
            className="fl-btn fl-btn-secondary"
            disabled={pending || saved || !team.trim() || !aud.trim()}
            onClick={() => run(() => saveCloudflareSettings(team, aud))}
          >
            Enregistrer
          </button>
          {enabled ? (
            <button
              type="button"
              className="fl-btn fl-btn-danger"
              disabled={pending}
              onClick={() =>
                run(
                  () => disableAccounts(),
                  "Désactiver les comptes ? Toute personne autorisée par Cloudflare aura de nouveau tous les droits. Les comptes et les rôles sont gardés.",
                )
              }
            >
              <Power size={14} /> Désactiver les comptes
            </button>
          ) : (
            <button
              type="button"
              className="fl-btn fl-btn-primary"
              disabled={pending || !saved || forcedOff}
              title={saved ? undefined : "Enregistre d'abord l'équipe et l'AUD"}
              onClick={() =>
                run(
                  () => enableAccounts(),
                  "Activer les comptes ? Ton adresse devient Administrateur ; les autres personnes devront demander un accès.",
                )
              }
            >
              <Power size={14} /> Activer les comptes
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/** Fenêtre « Nouveau rôle » / « Modifier le rôle » : un nom et les permissions cochées. */
function RoleEditor({ role, onClose }: { role: RoleInfo | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? "");
  const [checked, setChecked] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <ModalOverlay title={role ? `Rôle « ${role.name} »` : "Nouveau rôle"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            try {
              const r = await saveRole(role?.id ?? null, name, [...checked]);
              if (!r.ok) return setError(r.error);
              router.refresh();
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          });
        }}
        className="role-form"
      >
        <label className="role-name">
          <span className="fl-label">Nom du rôle</span>
          <input
            className="fl-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Apprenti, Chef, Patronne…"
            maxLength={60}
            autoFocus
          />
        </label>
        <p className="set-note">
          Coche ce que ce rôle peut faire ; ce qui reste décoché lui est interdit. Tout compte actif peut consulter les recettes.
        </p>
        {permissionGroups().map((g) => (
          <fieldset key={g.group} className="role-group">
            <legend>{g.group}</legend>
            {g.items.map((p) => (
              <div key={p.key} className="role-perm">
                <label>
                  <input type="checkbox" checked={checked.has(p.key)} onChange={() => toggle(p.key)} />
                  <span>{p.label}</span>
                </label>
                <Help title={p.label}>{p.help}</Help>
              </div>
            ))}
          </fieldset>
        ))}
        {error && <p className="acct-msg err">{error}</p>}
        <div className="set-foot">
          <button type="button" className="fl-btn fl-btn-secondary" onClick={onClose} disabled={pending}>
            Annuler
          </button>
          <button type="submit" className="fl-btn fl-btn-primary" disabled={pending || !name.trim()}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}
