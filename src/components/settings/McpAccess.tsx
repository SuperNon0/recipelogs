"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Copy, KeyRound, Power, RefreshCw, Wrench } from "lucide-react";
import { disableMcpAccess, regenerateMcpAccess } from "@/app/actions/mcp";
import { Help } from "@/components/ui/Help";

type ToolInfo = { name: string; description: string };

/** Réglages → Accès MCP : activer, copier l'adresse, changer la clé, couper. */
export function McpAccess({ token, tools }: { token: string | null; tools: ToolInfo[] }) {
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
        <h2>Ajouter RecipeLog dans Claude</h2>
      </div>
      <ol className="set-note" style={{ paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
        <li>
          Dans Cloudflare Zero Trust, ajoute une règle Access « Bypass » limitée au chemin{" "}
          <code>/api/mcp/*</code> (sinon Claude se heurte à la page de connexion Cloudflare).
        </li>
        <li>
          Sur claude.ai : Réglages → Connecteurs → Ajouter un connecteur personnalisé, puis colle
          l&apos;adresse ci-dessus.
        </li>
        <li>
          Avec Claude Code : <code>claude mcp add --transport http recipelog &lt;adresse&gt;</code>
        </li>
      </ol>

      <div className="sect-title">
        <h2>Outils disponibles</h2>
      </div>
      <div className="fl-list">
        {tools.map((t) => (
          <div key={t.name} className="fl-row">
            <span className="ic">
              <Wrench size={17} />
            </span>
            <span className="set-tx">
              <b>
                <span>{t.name}</span>
              </b>
              <small>{t.description}</small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
