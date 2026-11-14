import { NextResponse } from "next/server";
import { discover } from "@/lib/auth/oidc";
import { clearCookies, oidcSetup } from "@/lib/auth/oidcRoutes";
import { FLOW_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { VIEW_AS_COOKIE } from "@/lib/auth/viewer";

export const dynamic = "force-dynamic";

/**
 * GET /auth/deconnexion : efface la session du site, puis ferme aussi la
 * session chez Authentik (sinon un clic sur « Se connecter » rentrerait
 * aussitôt sans mot de passe). Ouverte sans session (tests/authGuards.test.ts).
 */
export async function GET() {
  const setup = oidcSetup();
  if (!setup.ok) return setup.response;
  const { config } = setup;

  let target = config.appUrl;
  try {
    const d = await discover(config);
    if (d.end_session_endpoint) {
      const url = new URL(d.end_session_endpoint);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("post_logout_redirect_uri", config.appUrl);
      target = url.toString();
    }
  } catch {
    // Authentik injoignable : la session du site est quand même effacée.
  }

  const res = NextResponse.redirect(target, 303);
  res.headers.set("Cache-Control", "no-store");
  return clearCookies(res, [SESSION_COOKIE, FLOW_COOKIE, VIEW_AS_COOKIE]);
}
