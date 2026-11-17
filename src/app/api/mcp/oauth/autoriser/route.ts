import { NextResponse, type NextRequest } from "next/server";
import { mcpAllowed } from "@/lib/mcp/allowed";
import {
  OAUTH_SCOPE,
  accountMayUseMcp,
  getOauthState,
  issueCode,
  noteConnection,
  oauthSetup,
  readConsent,
  redirectAllowed,
  resolveClient,
  resourceOk,
  signConsent,
  type AuthorizeRequest,
} from "@/lib/mcp/oauth";
import { oauthNotFound } from "@/lib/mcp/oauthHttp";
import { SESSION_COOKIE, sessionSecret, verifySession } from "@/lib/auth/session";
import { consentPage, oauthErrorPage } from "@/lib/mcp/oauthPages";

/**
 * Page « Autoriser Claude à utiliser RecipeLog ? ».
 * GET : vérifie la demande, envoie se connecter chez Authentik si besoin
 * (/auth/connexion, puis retour ici), puis affiche la page d'accord.
 * POST : la personne a cliqué « Autoriser » ou « Refuser » ; retour vers Claude.
 */
export const dynamic = "force-dynamic";

function sessionEmail(req: NextRequest): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const check = verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
  return check.ok ? check.session.email : null;
}

/** Retour vers l'application avec le résultat (code ou erreur), state et émetteur. */
function backToClient(redirectUri: string, params: Record<string, string | null>, status = 302): NextResponse {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url.toString(), status);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET(req: NextRequest) {
  const setup = oauthSetup();
  if (!setup || !mcpAllowed()) return oauthNotFound();
  const q = req.nextUrl.searchParams;

  const found = await resolveClient(q.get("client_id"), setup);
  if (!found.ok) return oauthErrorPage("Application inconnue", found.error.error_description);
  const client = found.client;
  let redirectUri = q.get("redirect_uri");
  if (!redirectUri && client.redirectUris.length === 1) redirectUri = client.redirectUris[0];
  if (!redirectUri || !redirectAllowed(client, redirectUri)) {
    return oauthErrorPage("Adresse de retour refusée", "L'application demande à revenir sur une adresse qu'elle n'a pas déclarée.");
  }
  const state = q.get("state");
  const fail = (error: string, description: string) =>
    backToClient(redirectUri!, { error, error_description: description, state, iss: setup.base });

  if (q.get("response_type") !== "code") return fail("unsupported_response_type", "Seul response_type=code est pris en charge.");
  const challenge = q.get("code_challenge");
  if (!challenge || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
    return fail("invalid_request", "PKCE (S256) est obligatoire.");
  }
  if (!resourceOk(q.get("resource"), setup.base)) return fail("invalid_target", "Cette ressource n'est pas servie ici.");

  // Pas encore connecté : connexion habituelle du site (Authentik), puis retour sur cette page.
  const email = sessionEmail(req);
  if (!email) {
    const retour = req.nextUrl.pathname + req.nextUrl.search;
    const res = NextResponse.redirect(new URL(`/auth/connexion?retour=${encodeURIComponent(retour)}`, setup.base), 303);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  if (!(await accountMayUseMcp(email))) {
    return oauthErrorPage(
      "Accès refusé",
      `Le compte ${email} n'a pas le droit de brancher Claude sur ce RecipeLog. Il faut la permission « Gérer l'accès Claude (MCP) » : demande-la à un administrateur, ou déconnecte-toi pour changer de compte.`,
      403,
      true,
    );
  }

  const request: AuthorizeRequest = {
    clientId: client.clientId,
    redirectUri,
    state,
    challenge,
    scope: OAUTH_SCOPE,
    resource: q.get("resource"),
  };
  return consentPage({
    clientName: client.name,
    redirectHost: new URL(redirectUri).host,
    redirectOrigin: new URL(redirectUri).origin,
    email,
    ticket: signConsent(request, email, client.name, setup.key),
    action: req.nextUrl.pathname,
  });
}

export async function POST(req: NextRequest) {
  const setup = oauthSetup();
  if (!setup || !mcpAllowed()) return oauthNotFound();
  const form = new URLSearchParams((await req.text()).slice(0, 20000));
  const consent = readConsent(form.get("billet") ?? "", setup.key);
  if (!consent) return oauthErrorPage("Page expirée", "La page d'autorisation a expiré. Relance la connexion depuis Claude.");
  // Le cookie de session (SameSite=Lax) n'est pas envoyé par un formulaire d'un autre site.
  const email = sessionEmail(req);
  if (!email || email !== consent.email) {
    return oauthErrorPage("Session changée", "Tu n'es plus connecté avec le même compte. Relance la connexion depuis Claude.");
  }
  const back = (params: Record<string, string | null>) =>
    backToClient(consent.redirectUri, { ...params, state: consent.state, iss: setup.base }, 303);

  if (form.get("choix") !== "autoriser") {
    return back({ error: "access_denied", error_description: "La personne a refusé." });
  }
  if (!(await accountMayUseMcp(email))) return back({ error: "access_denied", error_description: "Compte sans le droit de brancher Claude." });
  const { generation } = await getOauthState();
  const code = issueCode(consent, email, generation, setup.key);
  await noteConnection(consent.clientName, email).catch(() => {});
  return back({ code });
}
