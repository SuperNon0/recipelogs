"use client";

import { useEffect, useState, useTransition } from "react";
import {
  BookOpen,
  Check,
  Copy,
  Eye,
  KeyRound,
  Link2,
  ListChecks,
  Pencil,
  Power,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { disableMcpAccess, regenerateMcpAccess } from "@/app/actions/mcp";
import { Help } from "@/components/ui/Help";

type ToolInfo = { name: string; description: string; kind: "read" | "write" | "delete" };
export type ToolGroupInfo = { title: string; tools: ToolInfo[] };

const KIND: Record<ToolInfo["kind"], { icon: LucideIcon; label: string; color: string }> = {
  read: { icon: Eye, label: "Lecture", color: "var(--accent-2)" },
  write: { icon: Pencil, label: "Modifie", color: "var(--accent)" },
  delete: { icon: Trash2, label: "Supprime", color: "var(--danger)" },
};

/** Couleur de chaque groupe d'outils (titre et pastille). */
const GROUP_COLORS = ["var(--accent)", "var(--accent-2)", "var(--pending)", "var(--accent-3)", "#e48fc1", "#7cc4f0"];

/** Réglages → Accès MCP : activer, copier l'adresse et la clé, changer la clé, couper. */
export function McpAccess({ token, groups }: { token: string | null; groups: ToolGroupInfo[] }) {
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const endpoint = `${origin}/api/mcp`;
  const header = token ? `Bearer ${token}` : "";
  const urlWithKey = token ? `${endpoint}/${token}` : "";

  const regenerate = () => {
    if (token && !confirm("Changer la clé ? L'ancienne cessera aussitôt de marcher dans Claude.")) return;
    startTransition(async () => {
      await regenerateMcpAccess();
    });
  };

  const disable = () => {
    if (!confirm("Couper l'accès MCP ? Claude ne pourra plus rien lire ni modifier.")) return;
    startTransition(async () => {
      await disableMcpAccess();
    });
  };

  const copy = async (what: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* presse-papiers refusé : le texte reste sélectionnable à la main */
    }
  };

  const copyButton = (what: string, value: string) => (
    <button type="button" className="fl-btn fl-btn-secondary" onClick={() => copy(what, value)}>
      {copied === what ? <Check size={15} style={{ color: "var(--accent-2)" }} /> : <Copy size={15} />}
      {copied === what ? "Copié" : "Copier"}
    </button>
  );

  const total = groups.reduce((n, g) => n + g.tools.length, 0);

  return (
    <>
      <div className="mcp-status">
        <span className={`mcp-pill ${token ? "on" : "off"}`}>
          <span className="dot" />
          {token ? "Activé" : "Coupé"}
        </span>
        <span className="mcp-status-tx">
          {token ? (
            <>
              Claude peut utiliser <b>{total} outils</b>
            </>
          ) : (
            "Active l'accès pour brancher Claude"
          )}
        </span>
        <span className="mcp-setup">
          Mise en place
          <SetupHelp endpoint={endpoint} />
        </span>
      </div>

      <div className="fl-list">
        {!token ? (
          <div className="fl-row">
            <span className="ic mcp-ic" style={{ color: "var(--accent)" }}>
              <KeyRound size={17} />
            </span>
            <span className="set-tx">
              <b>
                <span>Clé secrète</span>
              </b>
              <small>Aucune clé pour l&apos;instant</small>
            </span>
            <button type="button" className="fl-btn fl-btn-primary" onClick={regenerate} disabled={pending}>
              <Power size={15} />
              {pending ? "Activation…" : "Activer"}
            </button>
          </div>
        ) : (
          <>
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--accent-2)" }}>
                <Link2 size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Adresse</span>
                  <Help title="Adresse du serveur">
                    L&apos;URL à donner à Claude. Seule, elle ne donne accès à rien : il faut aussi la
                    clé, dans l&apos;en-tête ci-dessous.
                  </Help>
                </b>
                <small className="mcp-val">{endpoint}</small>
              </span>
              {copyButton("endpoint", endpoint)}
            </div>
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--accent)" }}>
                <KeyRound size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>En-tête Authorization</span>
                  <Help title="En-tête Authorization">
                    La façon conseillée de donner la clé : Claude l&apos;envoie à chaque requête, elle
                    n&apos;apparaît pas dans l&apos;adresse. Dans claude.ai, nom <code>Authorization</code>,
                    valeur = ce texte (il commence par « Bearer »). <code>X-API-Key: &lt;clé&gt;</code> est
                    aussi accepté. Ne partage pas cette clé.
                  </Help>
                </b>
                <small className="mcp-val mcp-secret">{header}</small>
              </span>
              {copyButton("header", header)}
            </div>
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--pending)" }}>
                <Link2 size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Adresse avec la clé</span>
                  <Help title="Adresse avec la clé">
                    En secours, si l&apos;appli ne permet pas d&apos;ajouter un en-tête : la clé est à la fin
                    de l&apos;adresse. Ça marche aussi, mais la clé apparaît alors dans les journaux de
                    Cloudflare.
                  </Help>
                </b>
                <small className="mcp-val">{urlWithKey}</small>
              </span>
              {copyButton("url", urlWithKey)}
            </div>
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--danger)" }}>
                <RefreshCw size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Changer ou couper</span>
                  <Help title="Sécurité">
                    Sans la clé, l&apos;adresse répond « introuvable ». <b>Changer</b> crée une nouvelle clé
                    et l&apos;ancienne cesse aussitôt de marcher : remets la nouvelle dans Claude.{" "}
                    <b>Couper</b> ferme tout de suite l&apos;accès.
                  </Help>
                </b>
                <small>Si la clé a fuité</small>
              </span>
              <button type="button" className="fl-btn fl-btn-secondary" onClick={regenerate} disabled={pending}>
                Changer
              </button>
              <button type="button" className="fl-btn fl-btn-danger" onClick={disable} disabled={pending}>
                Couper
              </button>
            </div>
          </>
        )}
      </div>

      <div className="sect-title">
        <h2>Outils de Claude</h2>
        <span className="mcp-legend">
          {Object.values(KIND).map((k) => (
            <span key={k.label} style={{ color: k.color }}>
              <k.icon size={12} /> {k.label}
            </span>
          ))}
        </span>
      </div>

      {groups.map((g, gi) => {
        const color = GROUP_COLORS[gi % GROUP_COLORS.length];
        return (
          <section key={g.title} className="mcp-group">
            <h3 style={{ color }}>
              <span className="mcp-dot" style={{ background: color }} />
              {g.title}
              <span className="mcp-count">{g.tools.length}</span>
            </h3>
            <div className="fl-list">
              {g.tools.map((t) => {
                const k = KIND[t.kind];
                return (
                  <div key={t.name} className="fl-row mcp-tool">
                    <span className="ic mcp-ic" style={{ color: k.color }} title={k.label}>
                      <k.icon size={15} aria-label={k.label} />
                    </span>
                    <span className="set-tx">
                      <b>
                        <span>{t.name}</span>
                        <Help title={t.name}>{t.description}</Help>
                      </b>
                    </span>
                    <span className="mcp-kind" style={{ color: k.color }}>
                      {k.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

/** Le pas-à-pas de mise en place, rangé derrière un « ? ». */
function SetupHelp({ endpoint }: { endpoint: string }) {
  const steps: { icon: LucideIcon; color: string; title: string; body: React.ReactNode }[] = [
    {
      icon: Power,
      color: "var(--accent)",
      title: "Activer",
      body: <>Clique sur « Activer » : une clé secrète est créée.</>,
    },
    {
      icon: ShieldCheck,
      color: "var(--accent-2)",
      title: "Ouvrir le chemin dans Cloudflare",
      body: (
        <>
          Zero Trust → Access → Applications → <i>Add</i> → <i>Self-hosted</i>. Chemins{" "}
          <code>api/mcp</code> et <code>api/mcp/*</code>, règle <b>Bypass / Everyone</b>, placée
          au-dessus de celle du site. Le reste du site reste protégé.
        </>
      ),
    },
    {
      icon: ListChecks,
      color: "var(--pending)",
      title: "Vérifier",
      body: (
        <>
          Ouvre l&apos;adresse avec la clé en navigation privée : « Method not allowed » = OK. Page de
          connexion Cloudflare = la règle ne s&apos;applique pas encore.
        </>
      ),
    },
    {
      icon: BookOpen,
      color: "var(--accent-3)",
      title: "Ajouter dans Claude",
      body: (
        <>
          claude.ai : Paramètres → Connecteurs → <i>Ajouter un connecteur personnalisé</i>. URL ={" "}
          <b>Adresse</b>, puis dans « Request headers » : <code>Authorization</code> = l&apos;
          <b>en-tête</b> copié. Sans cette section : mets l&apos;<b>adresse avec la clé</b> comme URL.
          <br />
          Claude Code : <code>claude mcp add --transport http recipelog {endpoint} --header &quot;Authorization: Bearer &lt;clé&gt;&quot;</code>
        </>
      ),
    },
  ];
  return (
    <Help title="Mise en place (une seule fois)" label="Comment brancher Claude">
      <ol className="mcp-steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="no" style={{ color: s.color, borderColor: s.color }}>
              {i + 1}
            </span>
            <span>
              <b style={{ color: s.color }}>{s.title}</b>
              <br />
              {s.body}
            </span>
          </li>
        ))}
      </ol>
    </Help>
  );
}
