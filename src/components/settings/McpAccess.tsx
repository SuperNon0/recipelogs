"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, Eye, KeyRound, Pencil, Power, RefreshCw, Trash2 } from "lucide-react";
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
  const [copied, setCopied] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const url = token ? `${origin}/api/mcp/${token}` : null;

  const regenerate = () => {
    if (token && !confirm("Changer la clé ? L'adresse actuelle cessera de marcher dans Claude.")) return;
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

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* presse-papiers refusé : l'adresse reste sélectionnable à la main */
    }
  };

  return (
    <>
      <div className="fl-list">
        <div className="fl-row">
          <span className="ic">
            <KeyRound size={17} />
          </span>
          <span className="set-tx">
            <b>
              <span>Adresse du serveur MCP</span>
              <Help title="Adresse du serveur MCP">
                Cette adresse contient une clé secrète : toute personne qui la connaît peut utiliser
                les outils ci-dessous. Ne la partage pas. Si elle a fuité, change la clé : l&apos;ancienne
                adresse cesse aussitôt de marcher.
              </Help>
            </b>
            <small style={{ wordBreak: "break-all", userSelect: "all" }}>
              {url ?? "Accès coupé · active-le pour obtenir une adresse"}
            </small>
          </span>
          {url ? (
            <button type="button" className="fl-btn fl-btn-secondary" onClick={copy}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Copiée" : "Copier"}
            </button>
          ) : (
            <button type="button" className="fl-btn fl-btn-primary" onClick={regenerate} disabled={pending}>
              <Power size={15} />
              {pending ? "Activation…" : "Activer"}
            </button>
          )}
        </div>

        {url && (
          <div className="fl-row">
            <span className="ic">
              <RefreshCw size={17} />
            </span>
            <span className="set-tx">
              <b>
                <span>Clé secrète</span>
              </b>
              <small>Change la clé si l&apos;adresse a fuité, ou coupe l&apos;accès</small>
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
          <b>Active l&apos;accès</b> ci-dessus et copie l&apos;adresse.
        </li>
        <li>
          <b>Ouvre ce chemin dans Cloudflare.</b> Le site est derrière Cloudflare Zero Trust, qui
          demande de se connecter : Claude, lui, ne sait pas le faire. Dans le tableau de bord
          Cloudflare : Zero Trust → Access → Applications → <i>Add an application</i> →{" "}
          <i>Self-hosted</i>. Nom : « RecipeLog MCP ». Domaine : celui du site, avec le chemin{" "}
          <code>api/mcp</code>. Dans la règle (policy), choisis l&apos;action <b>Bypass</b> et
          « Everyone ». Enregistre. Le reste du site reste protégé comme avant : Cloudflare applique
          la règle la plus précise, et seul <code>/api/mcp/…</code> est ouvert.
        </li>
        <li>
          <b>Vérifie.</b> Colle l&apos;adresse dans une fenêtre de navigation privée : tu dois voir
          « Method not allowed » (c&apos;est normal, Claude n&apos;utilise pas cette méthode). Si tu
          vois la page de connexion Cloudflare, la règle de l&apos;étape 2 ne s&apos;applique pas encore.
        </li>
        <li>
          <b>Ajoute RecipeLog dans Claude.</b> Sur claude.ai (ordinateur) : Paramètres → Connecteurs →{" "}
          <i>Ajouter un connecteur personnalisé</i>. Nom : « RecipeLog », URL : l&apos;adresse copiée.
          Le connecteur marche ensuite aussi sur l&apos;application mobile. Avec Claude Code :{" "}
          <code>claude mcp add --transport http recipelog &lt;adresse&gt;</code>
        </li>
        <li>
          <b>Utilise-le.</b> Dans une conversation, active RecipeLog dans le menu des outils, puis
          demande par exemple « classe mes ingrédients à classer ». Claude te demande ton accord avant
          d&apos;utiliser un outil qui modifie ou supprime.
        </li>
      </ol>
      <p className="set-note" style={{ marginTop: 10 }}>
        Sécurité : sans la clé, l&apos;adresse répond « introuvable ». Si tu penses qu&apos;elle a
        fuité, change la clé ci-dessus puis colle la nouvelle adresse dans Claude. « Couper » ferme
        tout de suite l&apos;accès.
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
