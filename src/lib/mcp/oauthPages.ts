import { NextResponse } from "next/server";

/**
 * Pages de la connexion de Claude par OAuth (accord, erreurs). Hors de la mise
 * en page du site, aux couleurs de l'appli (encre, ambre), claires ou sombres.
 * Interdites dans un cadre (pas de clic détourné). Les e-mails sont entourés de
 * <!--email_off--> : sinon Cloudflare (Email Obfuscation) les remplace par
 * « [email protected] », et son script de décodage est bloqué par notre CSP.
 */

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STYLE = `
:root{--bg:#16130f;--card:#211c16;--line:#3a3128;--ink:#f3ede4;--soft:#b8ad9f;--accent:#d9922e;--accent-ink:#1b130a}
@media (prefers-color-scheme: light){:root{--bg:#f6f1ea;--card:#fff;--line:#e4dccf;--ink:#221c15;--soft:#6b6055}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
.card{max-width:440px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:28px 24px}
.brand{font-family:Georgia,"DM Serif Display",serif;font-size:22px;margin:0 0 18px;text-align:center}
.brand i{color:var(--accent)}
h1{font-family:Georgia,"DM Serif Display",serif;font-weight:400;font-size:21px;margin:0 0 12px;text-align:center}
p{font-size:14px;line-height:1.55;margin:0 0 14px;color:var(--soft)}
p b{color:var(--ink)}
ul{font-size:14px;line-height:1.55;margin:0 0 18px;padding-left:20px;color:var(--soft)}
.row{display:flex;gap:10px;margin-top:20px}
button,a.btn{flex:1;display:inline-block;text-align:center;padding:11px 16px;border-radius:10px;font:inherit;font-weight:600;
cursor:pointer;text-decoration:none;border:1px solid var(--line);background:transparent;color:var(--ink)}
button.ok{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
small{display:block;font-size:12px;color:var(--soft);margin-top:16px;text-align:center}`;

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)} · RecipeLog</title><style>${STYLE}</style></head>
<body><div class="card"><div class="brand">Recipe<i>Log</i></div>${body}</div></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'; form-action 'self'; default-src 'none'; style-src 'unsafe-inline'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function oauthErrorPage(title: string, text: string, status = 400, logout = false): NextResponse {
  // Le texte peut contenir l'e-mail du compte : <!--email_off--> évite que Cloudflare le masque.
  const extra = logout ? `<div class="row"><a class="btn" href="/auth/deconnexion">Se déconnecter</a></div>` : "";
  return page(title, `<h1>${escapeHtml(title)}</h1><p><!--email_off-->${escapeHtml(text)}<!--/email_off--></p>${extra}`, status);
}

export function consentPage(p: { clientName: string; redirectHost: string; email: string; ticket: string; action: string }): NextResponse {
  const name = escapeHtml(p.clientName);
  return page(
    `Autoriser ${p.clientName}`,
    `<h1>Autoriser ${name} ?</h1>
<p><b>${name}</b> (${escapeHtml(p.redirectHost)}) demande à utiliser ton RecipeLog avec le compte <b><!--email_off-->${escapeHtml(p.email)}<!--/email_off--></b>.</p>
<ul>
<li>Il pourra lire et modifier tes recettes, ingrédients, prix, fournisseurs, factures et cahiers, comme avec la clé de l'accès MCP.</li>
<li>Tu peux le déconnecter à tout moment dans Réglages → Accès MCP.</li>
</ul>
<form method="post" action="${escapeHtml(p.action)}">
<input type="hidden" name="billet" value="${escapeHtml(p.ticket)}">
<div class="row"><button type="submit" name="choix" value="refuser">Refuser</button><button class="ok" type="submit" name="choix" value="autoriser">Autoriser</button></div>
</form>
<small>N'autorise que si tu viens de lancer la connexion toi-même depuis Claude.</small>`,
  );
}
