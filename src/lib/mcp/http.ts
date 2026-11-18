import { mcpPermis, mcpKeyAllowed } from "@/lib/mcp/allowed";
import { handleMcpBody } from "./protocol";
import { getMcpToken, tokensMatch } from "./token";
import { MCP_TOOLS } from "./tools";
import { runAsService } from "@/lib/auth/service";
import { authMode } from "@/lib/auth/config";
import { getAnnonces } from "@/lib/auth/passerelle";
import { checkAccessToken, looksLikeAccessToken, oauthSetup, wwwAuthenticate } from "./oauth";

/**
 * Réponse HTTP du point d'accès MCP. La clé arrive dans l'en-tête
 * « Authorization: Bearer <clé> » ou « X-API-Key: <clé> ».
 * Sans clé valide : 404, comme si l'adresse n'existait pas.
 *
 * RecipeLog en ligne : un jeton OAuth (Claude connecté par Authentik, voir
 * oauth.ts) est aussi accepté dans « Authorization: Bearer ». Sans clé ni jeton
 * valable, la réponse est alors 401 avec l'adresse de la fiche OAuth, pour que
 * Claude propose « Se connecter ».
 */
export async function mcpResponse(req: Request): Promise<Response> {
  if (!(await mcpPermis())) return new Response("Not found", { status: 404 });
  // Clé secrète coupée depuis le panel : seule la connexion par compte reste.
  const expected = mcpKeyAllowed() ? await getMcpToken() : null;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)\s*$/i)?.[1];
  const given = bearer ?? req.headers.get("x-api-key")?.trim();
  let ok = !!expected && !!given && tokensMatch(given, expected);
  const oauth = oauthSetup();
  if (!ok && oauth && given && looksLikeAccessToken(given)) {
    ok = (await checkAccessToken(given, oauth)).ok;
  }
  if (!ok) {
    if (oauth) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": wwwAuthenticate(oauth.base, !!given), "Cache-Control": "no-store" },
      });
    }
    return new Response("Not found", { status: 404 });
  }
  if (req.method !== "POST") {
    // Pas de flux serveur → client (SSE) : le protocole prévoit 405 dans ce cas.
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }
  // Plateforme : pendant une maintenance, Claude ne peut rien lire ni modifier non plus.
  if (authMode() === "oidc" && (await getAnnonces()).maintenance) {
    return new Response("RecipeLog est en maintenance. Réessaie dans quelques minutes.", { status: 503, headers: { "Retry-After": "120", "Cache-Control": "no-store" } });
  }
  const body = await req.text();
  // Clé valide : les outils ont tous les droits, même quand les comptes sont activés.
  const out = await runAsService("mcp", () => handleMcpBody(body, MCP_TOOLS), publicOrigin(req));
  if (out === null) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}

/** https://<site> d'après les en-têtes du proxy (Cloudflare → nginx → Next). */
export function publicOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (!host) return new URL(req.url).origin;
  return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : proto}://${host}`;
}
