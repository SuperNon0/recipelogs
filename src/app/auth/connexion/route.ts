import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, discover, randomToken, safeReturnPath } from "@/lib/auth/oidc";
import { errorPage, oidcSetup } from "@/lib/auth/oidcRoutes";
import { FLOW_COOKIE, FLOW_MAX_AGE, SESSION_COOKIE, cookieOptions, signFlow, verifySession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /auth/connexion?retour=/chemin : part se connecter chez Authentik.
 * Ouverte sans session (tests/authGuards.test.ts l'exempte de garde).
 */
export async function GET(req: NextRequest) {
  const setup = oidcSetup();
  if (!setup.ok) return setup.response;
  const { config, secret } = setup;
  const retour = safeReturnPath(req.nextUrl.searchParams.get("retour"));

  // Déjà connecté : pas besoin de repasser par Authentik.
  if (verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret).ok) {
    return NextResponse.redirect(new URL(retour, config.appUrl), 303);
  }

  let discovery;
  try {
    discovery = await discover(config);
  } catch (e) {
    return errorPage(
      "Connexion indisponible",
      `Le service de connexion ne répond pas pour l'instant. Réessaie dans un moment. (${e instanceof Error ? e.message : String(e)})`,
      503,
    );
  }

  const flow = { state: randomToken(), nonce: randomToken(), verifier: randomToken(48), retour };
  const res = NextResponse.redirect(authorizeUrl(discovery, config, flow), 303);
  res.headers.set("Cache-Control", "no-store");
  res.cookies.set(FLOW_COOKIE, signFlow(flow, secret), cookieOptions(FLOW_MAX_AGE));
  return res;
}
