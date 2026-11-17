import { mcpAllowed } from "@/lib/mcp/allowed";
import {
  accountMayUseMcp,
  clientAuthenticated,
  getOauthState,
  issueTokens,
  oauthSetup,
  readRefresh,
  redeemCode,
  resolveClient,
  resourceOk,
} from "@/lib/mcp/oauth";
import { oauthJson, oauthNotFound, oauthPreflight, readForm } from "@/lib/mcp/oauthHttp";

/**
 * Échange du code (après « Autoriser ») ou du jeton de renouvellement contre un
 * jeton d'accès à /api/mcp. Le compte doit encore avoir le droit de brancher Claude.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const setup = oauthSetup();
  if (!setup || !mcpAllowed()) return oauthNotFound();
  const form = await readForm(req);

  // Identifiant (et secret éventuel) du client : dans le corps ou en « Basic ».
  let clientId = form.client_id ?? "";
  let secret: string | null = form.client_secret ?? null;
  const basic = req.headers.get("authorization")?.match(/^Basic\s+(\S+)$/i)?.[1];
  if (basic) {
    const raw = Buffer.from(basic, "base64").toString("utf8");
    const i = raw.indexOf(":");
    if (i > 0) {
      clientId = decodeURIComponent(raw.slice(0, i));
      secret = decodeURIComponent(raw.slice(i + 1));
    }
  }
  const found = await resolveClient(clientId, setup);
  if (!found.ok) return oauthJson(found.error, 401);
  if (!clientAuthenticated(found.client, secret, setup.key)) {
    return oauthJson({ error: "invalid_client", error_description: "Secret de l'application refusé." }, 401);
  }
  if (!resourceOk(form.resource, setup.base)) {
    return oauthJson({ error: "invalid_target", error_description: "Cette ressource n'est pas servie ici." }, 400);
  }

  let grant;
  if (form.grant_type === "authorization_code") {
    if (!form.code || !form.code_verifier) {
      return oauthJson({ error: "invalid_request", error_description: "code et code_verifier sont obligatoires." }, 400);
    }
    const out = redeemCode(form.code, { clientId, redirectUri: form.redirect_uri ?? null, verifier: form.code_verifier }, setup.key);
    if (!out.ok) return oauthJson(out.error, 400);
    grant = out.grant;
  } else if (form.grant_type === "refresh_token") {
    const out = readRefresh(form.refresh_token ?? "", clientId, setup.key);
    if (!out.ok) return oauthJson(out.error, 400);
    grant = out.grant;
  } else {
    return oauthJson({ error: "unsupported_grant_type", error_description: "authorization_code ou refresh_token." }, 400);
  }

  const state = await getOauthState();
  if (grant.generation !== state.generation || !(await accountMayUseMcp(grant.email))) {
    return oauthJson({ error: "invalid_grant", error_description: "Accès retiré : reconnecte Claude depuis ses réglages." }, 400);
  }
  return oauthJson(issueTokens(grant, setup.key));
}

export const OPTIONS = oauthPreflight;
