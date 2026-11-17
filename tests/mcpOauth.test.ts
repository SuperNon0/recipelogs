import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  clientAuthenticated,
  deriveKey,
  issueCode,
  issueTokens,
  oauthSetup,
  privateAddress,
  readAccess,
  readConsent,
  readRefresh,
  redeemCode,
  redirectAllowed,
  registerClient,
  resolveClient,
  resourceMetadata,
  resourceOk,
  serverMetadata,
  signConsent,
  wwwAuthenticate,
  type OauthSetup,
} from "@/lib/mcp/oauth";
import { verifySession } from "@/lib/auth/session";

const SECRET = "s".repeat(40);
const setup: OauthSetup = { base: "https://noe.recipelog.cc", key: deriveKey(SECRET) };
const CLAUDE = "https://claude.ai/api/mcp/auth_callback";
const verifier = "v".repeat(50);
const challenge = createHash("sha256").update(verifier).digest("base64url");

describe("OAuth de l'accès MCP", () => {
  it("n'existe qu'en mode plateforme bien réglé", () => {
    expect(oauthSetup({} as NodeJS.ProcessEnv)).toBeNull();
    const env = {
      RECIPELOG_AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://auth.recipelog.cc/application/o/rl-noe/",
      OIDC_CLIENT_ID: "x",
      OIDC_CLIENT_SECRET: "y",
      RECIPELOG_URL: "https://noe.recipelog.cc/",
      RECIPELOG_SESSION_SECRET: SECRET,
    } as unknown as NodeJS.ProcessEnv;
    expect(oauthSetup(env)?.base).toBe("https://noe.recipelog.cc");
    expect(oauthSetup({ ...env, RECIPELOG_SESSION_SECRET: "" })).toBeNull();
  });

  it("publie les fiches attendues par Claude", () => {
    expect(resourceMetadata(setup.base)).toMatchObject({ resource: "https://noe.recipelog.cc/api/mcp", authorization_servers: ["https://noe.recipelog.cc"] });
    const m = serverMetadata(setup.base);
    expect(m.issuer).toBe(setup.base);
    expect(m.client_id_metadata_document_supported).toBe(true);
    expect(m.registration_endpoint).toBe("https://noe.recipelog.cc/api/mcp/oauth/inscription");
    expect(m.code_challenge_methods_supported).toEqual(["S256"]);
    expect(wwwAuthenticate(setup.base, false)).toContain('resource_metadata="https://noe.recipelog.cc/.well-known/oauth-protected-resource/api/mcp"');
  });

  it("parcours complet DCR : inscription, accord, code, jetons, renouvellement", async () => {
    const reg = registerClient({ client_name: "Claude", redirect_uris: [CLAUDE], token_endpoint_auth_method: "none" }, setup);
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    const clientId = reg.response.client_id as string;
    expect(reg.response.client_secret).toBeUndefined();

    const found = await resolveClient(clientId, setup);
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.client.name).toBe("Claude");
    expect(redirectAllowed(found.client, CLAUDE)).toBe(true);
    expect(redirectAllowed(found.client, "https://evil.example/cb")).toBe(false);

    const req = { clientId, redirectUri: CLAUDE, state: "st", challenge, scope: "mcp", resource: null };
    const consent = readConsent(signConsent(req, "noe@x.fr", "Claude", setup.key), setup.key);
    expect(consent?.email).toBe("noe@x.fr");

    const code = issueCode(consent!, "noe@x.fr", 1, setup.key);
    expect(redeemCode(code, { clientId, redirectUri: CLAUDE, verifier: "w".repeat(50) }, setup.key).ok).toBe(false);
    const ok = redeemCode(code, { clientId, redirectUri: CLAUDE, verifier }, setup.key);
    expect(ok.ok).toBe(true);
    // Un code ne sert qu'une fois.
    expect(redeemCode(code, { clientId, redirectUri: CLAUDE, verifier }, setup.key).ok).toBe(false);
    if (!ok.ok) return;

    const tokens = issueTokens(ok.grant, setup.key);
    expect(readAccess(tokens.access_token, setup.key)).toEqual({ email: "noe@x.fr", generation: 1 });
    expect(readAccess(tokens.access_token, setup.key, Date.now() + 2 * 3600 * 1000)).toBeNull();
    expect(readAccess(tokens.access_token, deriveKey("t".repeat(40)))).toBeNull();
    expect(readAccess(tokens.refresh_token, setup.key)).toBeNull();
    expect(readRefresh(tokens.refresh_token, clientId, setup.key).ok).toBe(true);
    expect(readRefresh(tokens.refresh_token, "autre", setup.key).ok).toBe(false);
  });

  it("un jeton OAuth n'est jamais accepté comme cookie de session (clés différentes)", () => {
    const t = issueTokens({ email: "noe@x.fr", clientId: "c", scope: "mcp", generation: 1 }, setup.key);
    expect(verifySession(t.access_token.slice(4), SECRET).ok).toBe(false);
  });

  it("client avec secret (client_secret_post)", async () => {
    const reg = registerClient({ redirect_uris: [CLAUDE], token_endpoint_auth_method: "client_secret_post" }, setup);
    if (!reg.ok) throw new Error("inscription refusée");
    const found = await resolveClient(reg.response.client_id, setup);
    if (!found.ok) throw new Error("client introuvable");
    expect(clientAuthenticated(found.client, reg.response.client_secret as string, setup.key)).toBe(true);
    expect(clientAuthenticated(found.client, "faux", setup.key)).toBe(false);
    expect(clientAuthenticated(found.client, null, setup.key)).toBe(false);
  });

  it("refuse les inscriptions douteuses", () => {
    expect(registerClient({ redirect_uris: ["http://evil.example/cb"] }, setup).ok).toBe(false);
    expect(registerClient({ redirect_uris: [] }, setup).ok).toBe(false);
    expect(registerClient({ redirect_uris: ["http://127.0.0.1:3000/cb"] }, setup).ok).toBe(true);
  });

  it("CIMD : lit la fiche publique de Claude", async () => {
    const url = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    const found = await resolveClient(url, setup, async () => ({ client_id: url, client_name: "Claude", redirect_uris: [CLAUDE], token_endpoint_auth_method: "none" }));
    expect(found.ok && found.client.name).toBe("Claude");
    const bad = await resolveClient("https://x.example/fiche", setup, async () => ({ client_id: "https://autre/", redirect_uris: [CLAUDE] }));
    expect(bad.ok).toBe(false);
  });

  it("boucle locale : le port peut changer", () => {
    expect(redirectAllowed({ redirectUris: ["http://localhost:1234/callback"] }, "http://localhost:5555/callback")).toBe(true);
    expect(redirectAllowed({ redirectUris: ["http://localhost:1234/callback"] }, "http://localhost:5555/autre")).toBe(false);
  });

  it("ressource et adresses privées", () => {
    expect(resourceOk("https://noe.recipelog.cc/api/mcp", setup.base)).toBe(true);
    expect(resourceOk("https://autre.recipelog.cc/api/mcp", setup.base)).toBe(false);
    expect(privateAddress("10.0.0.1")).toBe(true);
    expect(privateAddress("192.168.0.234")).toBe(true);
    expect(privateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(privateAddress("160.79.104.10")).toBe(false);
  });
});
