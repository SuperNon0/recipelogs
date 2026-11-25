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
  Unplug,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { disableMcpAccess, regenerateMcpAccess, revokeMcpOauth } from "@/app/actions/mcp";
import { Help } from "@/components/ui/Help";
import { demander } from "@/components/ui/demander";

/** Connexion par compte (OAuth, RecipeLog en ligne) : dernières applications connectées. */
export type OauthInfo = { connections: { name: string; email: string; at: string }[] };

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
export function McpAccess({
  token: storedToken,
  groups,
  oauth = null,
  keyAllowed = true,
}: {
  token: string | null;
  groups: ToolGroupInfo[];
  oauth?: OauthInfo | null;
  /** false : clé secrète coupée depuis le panel (RecipeLog en ligne), section masquée. */
  keyAllowed?: boolean;
}) {
  const token = keyAllowed ? storedToken : null;
  const showKey = keyAllowed || !oauth;
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const endpoint = `${origin}/api/mcp`;
  const header = token ? `Bearer ${token}` : "";

  const regenerate = async () => {
    if (token && !await demander("Changer la clé ? L'ancienne cessera aussitôt de marcher dans Claude.")) return;
    startTransition(async () => {
      await regenerateMcpAccess();
    });
  };

  const disable = async () => {
    if (!await demander("Couper l'accès MCP ? Claude ne pourra plus rien lire ni modifier.")) return;
    startTransition(async () => {
      await disableMcpAccess();
    });
  };

  const revoke = async () => {
    if (!await demander("Déconnecter Claude ? Il faudra cliquer à nouveau sur « Se connecter » dans ses réglages.")) return;
    startTransition(async () => {
      await revokeMcpOauth();
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
  const on = !!token || !!oauth;

  return (
    <>
      <div className="mcp-status">
        <span className={`mcp-pill ${on ? "on" : "off"}`}>
          <span className="dot" />
          {on ? "Activé" : "Coupé"}
        </span>
        <span className="mcp-status-tx">
          {on ? (
            <>
              Claude peut utiliser <b>{total} outils</b>
            </>
          ) : (
            "Active l'accès pour brancher Claude"
          )}
        </span>
        <span className="mcp-setup">
          Mise en place
          {oauth ? <OauthSetupHelp /> : <SetupHelp endpoint={endpoint} />}
        </span>
      </div>

      {oauth && (
        <>
          <div className="sect-title">
            <h2>Connexion avec ton compte</h2>
          </div>
          <div className="fl-list">
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--accent-2)" }}>
                <Link2 size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Adresse</span>
                  <Help title="Se connecter avec ton compte">
                    La façon la plus simple : dans claude.ai, ajoute un connecteur personnalisé avec cette
                    adresse, puis clique sur <b>Se connecter</b>. Tu te connectes avec ton e-mail et ton mot de
                    passe RecipeLog (la même page que pour entrer dans l&apos;appli), puis tu cliques sur{" "}
                    <b>Autoriser</b>. Aucune clé à copier. Seuls les comptes qui ont la permission « Gérer
                    l&apos;accès Claude (MCP) » peuvent le faire. Claude reste connecté (il renouvelle seul
                    sa connexion) jusqu&apos;à ce que tu cliques sur « Déconnecter ».
                  </Help>
                </b>
                <small className="mcp-val">{endpoint}</small>
              </span>
              {copyButton("endpoint-oauth", endpoint)}
            </div>
            <div className="fl-row">
              <span className="ic mcp-ic" style={{ color: "var(--accent)" }}>
                <UserCheck size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Applications connectées</span>
                  <Help title="Applications connectées">
                    Les dernières connexions acceptées sur la page « Autoriser » : le nom de l&apos;application
                    (par exemple Claude), le compte utilisé et la date. <b>Déconnecter</b> coupe tout de suite
                    toutes ces connexions ; la clé secrète plus bas, elle, ne change pas. Un compte qui perd la
                    permission « Gérer l&apos;accès Claude (MCP) » ou qui est suspendu perd aussi sa connexion.
                  </Help>
                </b>
                <small>
                  {oauth.connections.length
                    ? oauth.connections
                        .map((c) => `${c.name} · ${c.email} · ${new Date(c.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}`)
                        .join(" — ")
                    : "Aucune pour l'instant"}
                </small>
              </span>
              {oauth.connections.length > 0 && (
                <button type="button" className="fl-btn fl-btn-danger" onClick={revoke} disabled={pending}>
                  <Unplug size={15} />
                  Déconnecter
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {oauth && showKey && (
        <div className="sect-title">
          <h2>Clé secrète</h2>
          <Help title="Clé secrète">
            L&apos;ancienne méthode, toujours possible : utile pour Claude Code ou un outil qui ne sait pas se
            connecter avec un compte. Inutile si Claude est connecté avec ton compte.
          </Help>
        </div>
      )}

      {showKey && (
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
              <span className="ic mcp-ic" style={{ color: "var(--danger)" }}>
                <RefreshCw size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Changer ou couper</span>
                  <Help title="Sécurité">
                    Sans la clé, l&apos;adresse répond « introuvable ». <b>Changer</b> crée une nouvelle clé
                    et l&apos;ancienne cesse aussitôt de marcher : remets la nouvelle dans Claude.{" "}
                    <b>Couper</b> ferme tout de suite l&apos;accès par la clé.
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
      )}

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

/** RecipeLog en ligne : mise en place avec la connexion par compte (OAuth). */
function OauthSetupHelp() {
  const steps: { icon: LucideIcon; color: string; title: string; body: React.ReactNode }[] = [
    {
      icon: Link2,
      color: "var(--accent)",
      title: "Copier l'adresse",
      body: <>Bouton « Copier » à côté de « Adresse ».</>,
    },
    {
      icon: BookOpen,
      color: "var(--accent-2)",
      title: "Ajouter le connecteur dans Claude",
      body: (
        <>
          claude.ai : Paramètres → Connecteurs → <i>Ajouter un connecteur personnalisé</i>. Nom : RecipeLog,
          URL : l&apos;adresse copiée. Dans les paramètres avancés, garde le choix proposé par défaut (fiche
          d&apos;identité de Claude, ou inscription automatique) et laisse « Client ID » et « Client secret »
          vides.
        </>
      ),
    },
    {
      icon: ShieldCheck,
      color: "var(--pending)",
      title: "Se connecter",
      body: (
        <>
          Clique sur <b>Se connecter</b> : la page de connexion RecipeLog s&apos;ouvre. Entre ton e-mail et ton mot
          de passe, puis clique sur <b>Autoriser</b>. Claude revient tout seul, connecté.
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
          <code>/api/mcp</code>, règle <b>Bypass / Everyone</b>, placée
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
          Ouvre l&apos;adresse sans clé en navigation privée. Une réponse 404 est attendue. Une page de connexion Cloudflare indique que la règle ne s&apos;applique pas encore.
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
          <b>en-tête</b> copié.
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
