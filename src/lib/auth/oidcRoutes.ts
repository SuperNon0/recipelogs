import { NextResponse } from "next/server";
import { authMode } from "./config";
import { oidcConfigCheck, type OidcConfig } from "./oidc";
import { cookieOptions, sessionSecret } from "./session";

/**
 * Petits outils partagés par les routes /auth/connexion, /auth/retour et
 * /auth/deconnexion (connexion par Authentik). Ces routes sont ouvertes sans
 * session : c'est justement par elles qu'on en obtient une.
 */

export type OidcSetup = { ok: true; config: OidcConfig; secret: string } | { ok: false; response: NextResponse };

/** Réglages de la connexion, ou la réponse d'erreur à renvoyer telle quelle. */
export function oidcSetup(): OidcSetup {
  if (authMode() !== "oidc") return { ok: false, response: new NextResponse("Not found", { status: 404 }) };
  const { config, missing } = oidcConfigCheck();
  const secret = sessionSecret();
  if (!secret) missing.push("RECIPELOG_SESSION_SECRET");
  if (!config || !secret) {
    return {
      ok: false,
      response: errorPage(
        "Connexion mal réglée",
        `Il manque des réglages sur le serveur (${missing.join(", ")}). Préviens la personne qui héberge le site.`,
        500,
      ),
    };
  }
  return { ok: true, config, secret };
}

/** Efface des cookies avec les mêmes attributs que ceux qui les ont posés. */
export function clearCookies(res: NextResponse, names: string[]): NextResponse {
  for (const name of names) res.cookies.set(name, "", cookieOptions(0));
  return res;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Page d'erreur simple, hors de la mise en page du site (le visiteur n'a pas de session). */
export function errorPage(title: string, text: string, status = 400): NextResponse {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · RecipeLog</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;
font-family:system-ui,-apple-system,sans-serif;background:#16130f;color:#f3ede4}
@media (prefers-color-scheme: light){body{background:#f6f1ea;color:#221c15}.card{background:#fff!important;border-color:#e4dccf!important}}
.card{max-width:420px;width:100%;background:#211c16;border:1px solid #3a3128;border-radius:16px;padding:28px 24px;text-align:center}
h1{font-size:20px;margin:0 0 12px}p{font-size:14px;line-height:1.55;margin:0 0 20px;opacity:.85}
a{display:inline-block;padding:10px 18px;border-radius:10px;background:#d9922e;color:#1b130a;text-decoration:none;font-weight:600}
</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p><a href="/auth/connexion">Réessayer</a></div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
