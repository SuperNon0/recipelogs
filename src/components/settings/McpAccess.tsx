"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Eye, KeyRound, Link2, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
import { disableMcpAccess, regenerateMcpAccess } from "@/app/actions/mcp";
import { Help } from "@/components/ui/Help";

type ToolInfo = { name: string; description: string; kind: "read" | "write" | "delete" };
export type ToolGroupInfo = { title: string; tools: ToolInfo[] };

const KIND = {
  read: { icon: Eye, label: "Lecture seule", color: "var(--muted)" },
  write: { icon: Pencil, label: "Modifie", color: "var(--accent)" },
  delete: { icon: Trash2, label: "Supprime", color: "var(--danger)" },
} as const;

/** Réglages → Accès MCP : activer, copier l'adresse, changer la clé, couper. */
export function McpAccess({ token, groups }: { token: string | null; groups: ToolGroupInfo[] }) {
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);

  const endpoint = `${origin}/api/mcp`;
  const header = token ? `Bearer ${token}` : null;
  const urlWithKey = token ? `${endpoint}/${token}` : null;

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
      {copied === what ? <Check size={15} /> : <Copy size={15} />}
      {copied === what ? "Copié" : "Copier"}
    </button>
  );

  return (
    <>
      <div className="fl-list">
        {!token ? (
          <div className="fl-row">
            <span className="ic">
              <KeyRound size={17} />
            </span>
            <span className="set-tx">
              <b>
                <span>Accès coupé</span>
              </b>
              <small>Active-le pour créer une clé secrète</small>
            </span>
            <button type="button" className="fl-btn fl-btn-primary" onClick={regenerate} disabled={pending}>
              <Power size={15} />
              {pending ? "Activation…" : "Activer"}
            </button>
          </div>
        ) : (
          <>
            <div className="fl-row">
              <span className="ic">
                <Link2 size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Adresse du serveur</span>
                </b>
                <small style={{ wordBreak: "break-all", userSelect: "all" }}>{endpoint}</small>
              </span>
              {copyButton("endpoint", endpoint)}
            </div>
            <div className="fl-row">
              <span className="ic">
                <KeyRound size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>En-tête Authorization</span>
                  <Help title="En-tête Authorization">
                    La façon conseillée de donner la clé : Claude l&apos;envoie dans l&apos;en-tête{" "}
                    <code>Authorization</code> de chaque requête, elle n&apos;apparaît pas dans
                    l&apos;adresse. Toute personne qui a cette clé peut utiliser les outils ci-dessous :
                    ne la partage pas.
                  </Help>
                </b>
                <small style={{ wordBreak: "break-all", userSelect: "all" }}>{header}</small>
              </span>
              {copyButton("header", header!)}
            </div>
            <div className="fl-row">
              <span className="ic">
                <Link2 size={17} />
              </span>
              <span className="set-tx">
                <b>
                  <span>Ou : adresse avec la clé</span>
                  <Help title="Adresse avec la clé">
                    Pour une appli qui ne permet pas d&apos;ajouter un en-tête : la clé est alors à la
                    fin de l&apos;adresse. Ça marche aussi, mais l&apos;adresse devient secrète.
                  </Help>
                </b>
                <small style={{ wordBreak: "break-all", userSelect: "all" }}>{urlWithKey}</small>
              </span>
              {copyButton("url", urlWithKey!)}
            </div>
          </>
        )}

        {token && (
          <div className="fl-row">
            <span className="ic">
              <RefreshCw size={17} />
            </span>
            <span className="set-tx">
              <b>
                <span>Clé secrète</span>
              </b>
              <small>Change la clé si elle a fuité, ou coupe l&apos;accès</small>
            </span>
            <button type="button" className="fl-btn fl-btn-secondary" onClick={regenerate} disabled={pending}>
              Changer
            </button>
            <button type="button" className="fl-btn fl-btn-danger" onClick={disable} disabled={pending}>
              Couper
            </button>
          </div>
        )}
      </div>

      <div className="sect-title">
        <h2>Mise en place, une seule fois</h2>
      </div>
      <ol className="set-note" style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <li>
          <b>Active l&apos;accès</b> ci-dessus.
        </li>
        <li>
          <b>Ouvre ce chemin dans Cloudflare.</b> Le site est derrière Cloudflare Zero Trust, qui
          demande de se connecter : Claude, lui, ne sait pas le faire. Dans Cloudflare Zero Trust :
          Access → Applications → <i>Add an application</i> → <i>Self-hosted</i>. Nom : « RecipeLog
          MCP ». Domaine : celui du site, chemin <code>api/mcp</code>, puis une 2ᵉ entrée{" "}
          <code>api/mcp/*</code> (pour l&apos;adresse avec la clé). Règle (policy) : action{" "}
          <b>Bypass</b>, Include <b>Everyone</b>. Enregistre, et place cette application{" "}
          <b>au-dessus</b> de celle qui protège tout le site. Le reste du site reste protégé ;{" "}
          <code>/api/mcp</code> reste verrouillé par la clé.
        </li>
        <li>
          <b>Vérifie.</b> Colle l&apos;adresse avec la clé dans une fenêtre de navigation privée : tu
          dois voir « Method not allowed » (normal, Claude n&apos;utilise pas cette méthode). Si tu
          vois la page de connexion Cloudflare, la règle de l&apos;étape 2 ne s&apos;applique pas encore.
        </li>
        <li>
          <b>Ajoute RecipeLog dans Claude.</b> Sur claude.ai : Paramètres → Connecteurs →{" "}
          <i>Ajouter un connecteur personnalisé</i>. Nom : « RecipeLog », URL : l&apos;
          <b>adresse du serveur</b>. Dans « En-têtes de requête » (Request headers), ajoute{" "}
          <code>Authorization</code> avec la valeur de l&apos;<b>en-tête Authorization</b> copiée
          ci-dessus (elle commence par « Bearer »). Si cette section n&apos;apparaît pas sur ton compte,
          mets plutôt l&apos;<b>adresse avec la clé</b> comme URL. Le connecteur marche ensuite aussi sur
          l&apos;application mobile.
          <br />
          Claude Code :{" "}
          <code>claude mcp add --transport http recipelog &lt;adresse&gt; --header &quot;Authorization: Bearer &lt;clé&gt;&quot;</code>
          <br />
          Claude Desktop (fichier <code>claude_desktop_config.json</code>) :
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "6px 0 0" }}>
            {`{
  "mcpServers": {
    "recipelog": {
      "command": "npx",
      "args": ["mcp-remote", "${endpoint}",
               "--header", "Authorization: Bearer <clé>"]
    }
  }
}`}
          </pre>
        </li>
        <li>
          <b>Utilise-le.</b> Dans une conversation, active RecipeLog dans le menu des outils, puis
          demande par exemple « classe mes ingrédients à classer ». Claude te demande ton accord avant
          d&apos;utiliser un outil qui modifie ou supprime.
        </li>
      </ol>
      <p className="set-note" style={{ marginTop: 10 }}>
        Sécurité : sans la clé, l&apos;adresse répond « introuvable ». Préfère l&apos;en-tête à
        l&apos;adresse avec la clé : sinon la clé apparaît dans les journaux de Cloudflare. Si tu penses
        qu&apos;elle a fuité, change la clé ci-dessus puis mets la nouvelle dans Claude. « Couper » ferme
        tout de suite l&apos;accès. L&apos;en-tête <code>X-API-Key: &lt;clé&gt;</code> est aussi accepté.
      </p>

      {groups.map((g) => (
        <div key={g.title}>
          <div className="sect-title">
            <h2>{g.title}</h2>
          </div>
          <div className="fl-list">
            {g.tools.map((t) => {
              const k = KIND[t.kind];
              return (
                <div key={t.name} className="fl-row">
                  <span className="ic" style={{ color: k.color }} title={k.label}>
                    <k.icon size={17} aria-label={k.label} />
                  </span>
                  <span className="set-tx">
                    <b>
                      <span>{t.name}</span>
                    </b>
                    <small>{t.description}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
