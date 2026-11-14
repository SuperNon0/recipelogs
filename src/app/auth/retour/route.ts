import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { discover, exchangeCode, jwksFetcher, safeReturnPath, verifyIdToken } from "@/lib/auth/oidc";
import { clearCookies, errorPage, oidcSetup } from "@/lib/auth/oidcRoutes";
import {
  FLOW_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  cookieOptions,
  readFlow,
  signSession,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * GET /auth/retour?code=…&state=… : retour d'Authentik. Vérifie state,
 * échange le code (PKCE), vérifie l'id_token (nonce compris), pose la session.
 * Ouverte sans session (tests/authGuards.test.ts l'exempte de garde).
 */
export async function GET(req: NextRequest) {
  const setup = oidcSetup();
  if (!setup.ok) return setup.response;
  const { config, secret } = setup;

  const flow = readFlow(req.cookies.get(FLOW_COOKIE)?.value, secret);
  const fail = (title: string, text: string, status = 400) => clearCookies(errorPage(title, text, status), [FLOW_COOKIE]);

  const params = req.nextUrl.searchParams;
  const providerError = params.get("error");
  if (providerError) {
    return fail(
      "Connexion annulée",
      providerError === "access_denied"
        ? "La connexion a été refusée : ce compte n'a peut-être pas accès à ce site. Demande au responsable de t'inviter."
        : `Le service de connexion a renvoyé une erreur (${params.get("error_description") || providerError}).`,
      403,
    );
  }

  if (!flow) {
    return fail(
      "Connexion expirée",
      "La connexion a pris plus de 10 minutes, ou elle a été ouverte dans un autre onglet. Recommence.",
    );
  }
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  if (!state || !sameText(state, flow.state)) {
    return fail("Connexion refusée", "Cette réponse ne correspond pas à ta demande de connexion. Recommence.");
  }
  if (!code) return fail("Connexion refusée", "Aucun code de connexion reçu. Recommence.");

  let discovery;
  try {
    discovery = await discover(config);
  } catch (e) {
    return fail("Connexion indisponible", `Le service de connexion ne répond pas. (${e instanceof Error ? e.message : String(e)})`, 503);
  }

  const tokens = await exchangeCode(discovery, config, code, flow.verifier);
  if (!tokens.ok) return fail("Connexion refusée", tokens.error, 502);

  const check = await verifyIdToken(
    tokens.idToken,
    { issuer: config.issuer, clientId: config.clientId, nonce: flow.nonce, jwksUri: discovery.jwks_uri },
    { fetchKeys: jwksFetcher(config) },
  );
  if (!check.ok) return fail("Connexion refusée", check.error, 401);

  const res = NextResponse.redirect(new URL(safeReturnPath(flow.retour), config.appUrl), 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(SESSION_COOKIE, signSession(check.email, secret), cookieOptions(SESSION_MAX_AGE));
  return clearCookies(res, [FLOW_COOKIE]);
}
