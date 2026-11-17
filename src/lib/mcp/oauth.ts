import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { prisma } from "@/lib/prisma";
import { oidcConfig } from "@/lib/auth/oidc";
import { readValue, sessionSecret, signValue } from "@/lib/auth/session";
import { rolePermissions } from "@/lib/auth/permissions";

/**
 * Connexion de Claude à l'accès MCP par OAuth (RecipeLog en ligne seulement).
 *
 * Le site joue lui-même le « serveur d'autorisation » de son point d'accès MCP :
 * Claude (claude.ai) découvre /.well-known/oauth-protected-resource, puis
 * /.well-known/oauth-authorization-server, s'inscrit (CIMD : son client_id est
 * l'adresse de sa fiche publique ; ou DCR : POST /api/mcp/oauth/inscription),
 * envoie la personne sur /api/mcp/oauth/autoriser. Là, la personne se connecte
 * avec son compte Authentik (la connexion habituelle du site), puis accepte.
 * Claude reçoit un code, l'échange contre un jeton d'accès (1 h) et un jeton de
 * renouvellement (60 jours) sur /api/mcp/oauth/jeton.
 *
 * Rien n'est rangé en base pour les clients et les jetons : tout est signé
 * (HMAC) avec une clé tirée de RECIPELOG_SESSION_SECRET, distincte de celle des
 * cookies. Pour tout couper : « Déconnecter Claude » (Réglages → Accès MCP)
 * change la « génération », ce qui invalide tous les jetons déjà donnés.
 * À chaque appel, le compte doit encore être actif avec « Gérer l'accès Claude (MCP) ».
 *
 * La clé secrète (en-tête Bearer) marche toujours, comme avant.
 */

export const OAUTH_SCOPE = "mcp";
export const ACCESS_TTL = 60 * 60;
export const REFRESH_TTL = 60 * 24 * 60 * 60;
export const CODE_TTL = 5 * 60;
export const CONSENT_TTL = 10 * 60;
/** Préfixe des jetons d'accès, pour les reconnaître de la clé secrète. */
export const ACCESS_PREFIX = "rlo_";
const REFRESH_PREFIX = "rlr_";
const CLIENT_PREFIX = "rlc_";
/** Fiches DCR : sans date de fin réelle (100 ans). */
const CLIENT_TTL = 100 * 365 * 24 * 60 * 60;

export type OauthSetup = {
  /** https://<site>, sans barre finale : émetteur et base de toutes les adresses. */
  base: string;
  /** Clé HMAC propre à OAuth (jamais celle des cookies de session). */
  key: string;
};

/** OAuth n'existe qu'en mode plateforme, avec la connexion Authentik bien réglée. */
export function oauthSetup(env: NodeJS.ProcessEnv = process.env): OauthSetup | null {
  if ((env.RECIPELOG_AUTH_MODE ?? "").trim().toLowerCase() !== "oidc") return null;
  const config = oidcConfig(env);
  const secret = sessionSecret(env);
  if (!config || !secret) return null;
  return { base: config.appUrl, key: deriveKey(secret) };
}

export function deriveKey(secret: string): string {
  return createHmac("sha256", secret).update("recipelog-mcp-oauth-v1").digest("base64url");
}

export function urls(base: string) {
  return {
    resource: `${base}/api/mcp`,
    resourceMetadata: `${base}/.well-known/oauth-protected-resource/api/mcp`,
    authorize: `${base}/api/mcp/oauth/autoriser`,
    token: `${base}/api/mcp/oauth/jeton`,
    register: `${base}/api/mcp/oauth/inscription`,
  };
}

/** RFC 9728 : fiche de la ressource protégée (le point d'accès MCP). */
export function resourceMetadata(base: string) {
  const u = urls(base);
  return {
    resource: u.resource,
    authorization_servers: [base],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "RecipeLog",
  };
}

/** RFC 8414 : fiche du serveur d'autorisation. */
export function serverMetadata(base: string) {
  const u = urls(base);
  return {
    issuer: base,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [OAUTH_SCOPE],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/settings/mcp`,
  };
}

/** En-tête WWW-Authenticate d'une réponse 401 du point d'accès MCP. */
export function wwwAuthenticate(base: string, invalid: boolean): string {
  const parts = [`resource_metadata="${urls(base).resourceMetadata}"`, `scope="${OAUTH_SCOPE}"`];
  if (invalid) parts.unshift(`error="invalid_token"`);
  return `Bearer ${parts.join(", ")}`;
}

// ── Valeurs signées ─────────────────────────────────────────

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function sealed(prefix: string, payload: Record<string, unknown>, key: string): string {
  return prefix + signValue(payload, key);
}

function unseal(raw: string, prefix: string, type: string, key: string, at?: number): Record<string, unknown> | null {
  if (typeof raw !== "string" || !raw.startsWith(prefix) || raw.length > 6000) return null;
  const v = readValue(raw.slice(prefix.length), key, at);
  return v && v.t === type ? v : null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ── Clients (applications qui veulent se connecter) ─────────

export type AuthMethod = "none" | "client_secret_post" | "client_secret_basic";
export type OauthClient = {
  clientId: string;
  name: string;
  redirectUris: string[];
  authMethod: AuthMethod;
  /** Adresse de la fiche publique du client (CIMD), sinon null (inscription DCR). */
  metadataUrl: string | null;
};

type OauthError = { error: string; error_description: string };
const err = (error: string, error_description: string): OauthError => ({ error, error_description });

/** Adresse de retour acceptable : https, ou http sur la machine même (Claude Code, appli de bureau). */
export function validRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && isLoopback(u.hostname);
}

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** Adresse exactement inscrite ; sur la machine même, le port peut changer (RFC 8252). */
export function redirectAllowed(client: Pick<OauthClient, "redirectUris">, given: string): boolean {
  if (client.redirectUris.includes(given)) return true;
  let g: URL;
  try {
    g = new URL(given);
  } catch {
    return false;
  }
  if (g.protocol !== "http:" || !isLoopback(g.hostname)) return false;
  return client.redirectUris.some((r) => {
    try {
      const u = new URL(r);
      return u.protocol === "http:" && u.hostname === g.hostname && u.pathname === g.pathname && u.search === g.search;
    } catch {
      return false;
    }
  });
}

function cleanName(raw: unknown, fallback: string): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "";
  return (s || fallback).slice(0, 80);
}

/** RFC 7591 : inscription automatique (DCR). Le client_id contient sa fiche, signée. */
export function registerClient(body: unknown, setup: OauthSetup): { ok: true; response: Record<string, unknown> } | { ok: false; error: OauthError } {
  if (!body || typeof body !== "object") return { ok: false, error: err("invalid_client_metadata", "Fiche du client illisible.") };
  const b = body as Record<string, unknown>;
  const redirects = Array.isArray(b.redirect_uris) ? b.redirect_uris : [];
  if (!redirects.length || redirects.length > 10 || !redirects.every(validRedirectUri)) {
    return { ok: false, error: err("invalid_redirect_uri", "Adresses de retour manquantes ou refusées (https, ou http sur la machine même).") };
  }
  const grants = Array.isArray(b.grant_types) ? b.grant_types : ["authorization_code"];
  if (!grants.every((g) => g === "authorization_code" || g === "refresh_token")) {
    return { ok: false, error: err("invalid_client_metadata", "Seuls authorization_code et refresh_token sont pris en charge.") };
  }
  const requested = typeof b.token_endpoint_auth_method === "string" ? b.token_endpoint_auth_method : "client_secret_basic";
  if (!["none", "client_secret_post", "client_secret_basic"].includes(requested)) {
    return { ok: false, error: err("invalid_client_metadata", "Méthode d'authentification du client non prise en charge.") };
  }
  const authMethod = requested as AuthMethod;
  const name = cleanName(b.client_name, new URL(redirects[0] as string).host);
  const issuedAt = now();
  const clientId = sealed(CLIENT_PREFIX, { t: "client", n: name, r: redirects, m: authMethod, iat: issuedAt, exp: issuedAt + CLIENT_TTL }, setup.key);
  const response: Record<string, unknown> = {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    client_name: name,
    redirect_uris: redirects,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: authMethod,
    scope: OAUTH_SCOPE,
  };
  if (authMethod !== "none") {
    response.client_secret = clientSecret(clientId, setup.key);
    response.client_secret_expires_at = 0;
  }
  return { ok: true, response };
}

export function clientSecret(clientId: string, key: string): string {
  return createHmac("sha256", key).update(`secret:${clientId}`).digest("base64url");
}

/** Un client_id en forme d'adresse https : fiche publique (CIMD). */
export function isMetadataUrl(clientId: string): boolean {
  if (!clientId.startsWith("https://") || clientId.length > 2000) return false;
  try {
    const u = new URL(clientId);
    return u.pathname !== "/" && !u.hash && !u.username && !u.password;
  } catch {
    return false;
  }
}

export type MetadataFetcher = (url: string) => Promise<unknown>;

const cimdCache = new Map<string, { at: number; client: OauthClient }>();
const CIMD_TTL_MS = 10 * 60 * 1000;

/** Retrouve un client : fiche signée (DCR) ou fiche publique lue à son adresse (CIMD). */
export async function resolveClient(
  clientId: unknown,
  setup: OauthSetup,
  fetchMetadata: MetadataFetcher = fetchClientMetadata,
): Promise<{ ok: true; client: OauthClient } | { ok: false; error: OauthError }> {
  if (typeof clientId !== "string" || !clientId) return { ok: false, error: err("invalid_client", "client_id manquant.") };
  if (clientId.startsWith(CLIENT_PREFIX)) {
    const v = unseal(clientId, CLIENT_PREFIX, "client", setup.key);
    if (!v || !Array.isArray(v.r) || typeof v.n !== "string" || typeof v.m !== "string") {
      return { ok: false, error: err("invalid_client", "Application inconnue : reconnecte-la depuis Claude.") };
    }
    return { ok: true, client: { clientId, name: v.n, redirectUris: v.r.filter((x): x is string => typeof x === "string"), authMethod: v.m as AuthMethod, metadataUrl: null } };
  }
  if (!isMetadataUrl(clientId)) return { ok: false, error: err("invalid_client", "client_id non reconnu.") };

  const cached = cimdCache.get(clientId);
  if (cached && Date.now() - cached.at < CIMD_TTL_MS) return { ok: true, client: cached.client };
  let doc: unknown;
  try {
    doc = await fetchMetadata(clientId);
  } catch (e) {
    return { ok: false, error: err("invalid_client", `Fiche de l'application illisible (${e instanceof Error ? e.message : String(e)}).`) };
  }
  const d = (doc ?? {}) as Record<string, unknown>;
  if (d.client_id !== clientId) return { ok: false, error: err("invalid_client", "La fiche de l'application ne porte pas son propre client_id.") };
  const redirects = Array.isArray(d.redirect_uris) ? d.redirect_uris.filter(validRedirectUri) : [];
  if (!redirects.length) return { ok: false, error: err("invalid_client", "La fiche de l'application n'a aucune adresse de retour valable.") };
  const method = typeof d.token_endpoint_auth_method === "string" ? d.token_endpoint_auth_method : "none";
  if (method !== "none") return { ok: false, error: err("invalid_client", "Seules les applications sans secret peuvent utiliser leur fiche publique.") };
  const client: OauthClient = {
    clientId,
    name: cleanName(d.client_name, new URL(clientId).host),
    redirectUris: redirects.slice(0, 20),
    authMethod: "none",
    metadataUrl: clientId,
  };
  cimdCache.set(clientId, { at: Date.now(), client });
  if (cimdCache.size > 50) cimdCache.delete(cimdCache.keys().next().value as string);
  return { ok: true, client };
}

/** Adresse IP privée, locale ou réservée : jamais appelée par le serveur. */
export function privateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s.startsWith("::ffff:")) return privateAddress(s.slice(7));
    return s === "::" || s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") ||
      s.startsWith("fea") || s.startsWith("feb") || s.startsWith("ff");
  }
  return true;
}

/** Lit la fiche publique d'une application (CIMD), sans jamais toucher le réseau interne. */
export async function fetchClientMetadata(url: string): Promise<unknown> {
  const u = new URL(url);
  if (u.protocol !== "https:" || (u.port && u.port !== "443")) throw new Error("adresse https attendue");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) || host === "localhost" || /\.(local|internal|lan|home|localhost)$/i.test(host) || !host.includes(".")) {
    throw new Error("adresse refusée");
  }
  const addrs = await lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new Error("adresse refusée");
  const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (text.length > 20000) throw new Error("fiche trop grande");
  return JSON.parse(text);
}

/** Vérifie le secret d'un client qui en a un (client_secret_post ou client_secret_basic). */
export function clientAuthenticated(client: OauthClient, given: string | null, key: string): boolean {
  if (client.authMethod === "none") return true;
  return !!given && safeEqual(given, clientSecret(client.clientId, key));
}

// ── Accord, code, jetons ────────────────────────────────────

export type AuthorizeRequest = {
  clientId: string;
  redirectUri: string;
  state: string | null;
  challenge: string;
  scope: string;
  resource: string | null;
};

/** Ressource demandée : seulement le point d'accès MCP de ce site (ou rien). */
export function resourceOk(raw: string | null | undefined, base: string): boolean {
  if (!raw) return true;
  const r = raw.replace(/\/+$/, "");
  return r === urls(base).resource || r === base;
}

/** Billet signé glissé dans la page d'accord, relu quand la personne clique. */
export function signConsent(req: AuthorizeRequest, email: string, clientName: string, key: string): string {
  return signValue({ t: "consent", ...req, email, clientName, n: randomBytes(8).toString("base64url"), exp: now() + CONSENT_TTL }, key);
}

export function readConsent(raw: string, key: string): (AuthorizeRequest & { email: string; clientName: string }) | null {
  const v = readValue(raw, key);
  if (!v || v.t !== "consent") return null;
  const s = (x: unknown) => (typeof x === "string" ? x : null);
  const clientId = s(v.clientId), redirectUri = s(v.redirectUri), challenge = s(v.challenge), email = s(v.email);
  if (!clientId || !redirectUri || !challenge || !email) return null;
  return { clientId, redirectUri, state: s(v.state), challenge, scope: s(v.scope) ?? OAUTH_SCOPE, resource: s(v.resource), email, clientName: s(v.clientName) ?? "Application" };
}

export function issueCode(req: AuthorizeRequest, email: string, generation: number, key: string): string {
  return signValue(
    { t: "code", c: req.clientId, r: req.redirectUri, ch: req.challenge, s: req.scope, e: email, g: generation, j: randomBytes(12).toString("base64url"), exp: now() + CODE_TTL },
    key,
  );
}

/** Codes déjà échangés (un code ne sert qu'une fois). Un seul processus par site : la mémoire suffit. */
const usedCodes = new Map<string, number>();

function markUsed(jti: string, exp: number): boolean {
  const t = now();
  for (const [k, e] of usedCodes) if (e < t) usedCodes.delete(k);
  if (usedCodes.has(jti)) return false;
  usedCodes.set(jti, exp);
  return true;
}

export type Grant = { email: string; clientId: string; scope: string; generation: number };

export function pkceOk(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return safeEqual(createHash("sha256").update(verifier).digest("base64url"), challenge);
}

export function redeemCode(
  raw: string,
  p: { clientId: string; redirectUri: string | null; verifier: string },
  key: string,
): { ok: true; grant: Grant } | { ok: false; error: OauthError } {
  const v = readValue(raw, key);
  if (!v || v.t !== "code" || typeof v.j !== "string") return { ok: false, error: err("invalid_grant", "Code de connexion inconnu ou expiré.") };
  if (v.c !== p.clientId) return { ok: false, error: err("invalid_grant", "Ce code appartient à une autre application.") };
  if (p.redirectUri !== null && v.r !== p.redirectUri) return { ok: false, error: err("invalid_grant", "Adresse de retour différente.") };
  if (typeof v.ch !== "string" || !pkceOk(p.verifier, v.ch)) return { ok: false, error: err("invalid_grant", "Vérification PKCE refusée.") };
  if (!markUsed(v.j, v.exp as number)) return { ok: false, error: err("invalid_grant", "Code déjà utilisé.") };
  return { ok: true, grant: { email: String(v.e), clientId: p.clientId, scope: String(v.s ?? OAUTH_SCOPE), generation: Number(v.g) } };
}

/** Empreinte courte du client, rangée dans le jeton d'accès (le client_id DCR est long). */
function clientTag(clientId: string): string {
  return createHash("sha256").update(clientId).digest("base64url").slice(0, 16);
}

export function issueTokens(grant: Grant, key: string) {
  const t = now();
  const access = sealed(ACCESS_PREFIX, { t: "at", e: grant.email, c: clientTag(grant.clientId), g: grant.generation, exp: t + ACCESS_TTL }, key);
  const refresh = sealed(REFRESH_PREFIX, { t: "rt", e: grant.email, c: grant.clientId, s: grant.scope, g: grant.generation, j: randomBytes(9).toString("base64url"), exp: t + REFRESH_TTL }, key);
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: grant.scope };
}

export function readRefresh(raw: string, clientId: string, key: string): { ok: true; grant: Grant } | { ok: false; error: OauthError } {
  const v = unseal(raw, REFRESH_PREFIX, "rt", key);
  if (!v) return { ok: false, error: err("invalid_grant", "Jeton de renouvellement inconnu ou expiré : reconnecte Claude.") };
  if (v.c !== clientId) return { ok: false, error: err("invalid_grant", "Ce jeton appartient à une autre application.") };
  return { ok: true, grant: { email: String(v.e), clientId, scope: String(v.s ?? OAUTH_SCOPE), generation: Number(v.g) } };
}

export function readAccess(raw: string, key: string, at?: number): { email: string; generation: number } | null {
  const v = unseal(raw, ACCESS_PREFIX, "at", key, at);
  if (!v || typeof v.e !== "string" || typeof v.g !== "number") return null;
  return { email: v.e, generation: v.g };
}

export function looksLikeAccessToken(raw: string): boolean {
  return raw.startsWith(ACCESS_PREFIX);
}

// ── État rangé en base : génération et dernières connexions ─

const STATE_KEY = "mcpOauth";

export type OauthConnection = { name: string; email: string; at: string };
export type OauthState = { generation: number; connections: OauthConnection[] };

export async function getOauthState(): Promise<OauthState> {
  const row = await prisma.setting.findUnique({ where: { key: STATE_KEY } });
  const v = (row?.value ?? {}) as Partial<OauthState>;
  return {
    generation: typeof v.generation === "number" ? v.generation : 1,
    connections: Array.isArray(v.connections) ? v.connections.filter((c) => c && typeof c.name === "string").slice(0, 10) : [],
  };
}

async function saveOauthState(state: OauthState): Promise<void> {
  const value = { generation: state.generation, connections: state.connections };
  await prisma.setting.upsert({ where: { key: STATE_KEY }, update: { value }, create: { key: STATE_KEY, value } });
}

/** « Déconnecter Claude » : tous les jetons déjà donnés cessent de marcher. */
export async function revokeAllOauth(): Promise<void> {
  const s = await getOauthState();
  await saveOauthState({ generation: s.generation + 1, connections: [] });
}

/** Note la connexion (nom de l'application, compte, date) pour l'afficher dans Réglages → Accès MCP. */
export async function noteConnection(name: string, email: string): Promise<void> {
  const s = await getOauthState();
  const rest = s.connections.filter((c) => !(c.name === name && c.email === email));
  await saveOauthState({ ...s, connections: [{ name, email, at: new Date().toISOString() }, ...rest].slice(0, 10) });
}

/** Le compte peut-il brancher Claude ? Actif, avec « Gérer l'accès Claude (MCP) ». */
export async function accountMayUseMcp(email: string): Promise<boolean> {
  const account = await prisma.account.findUnique({ where: { email: email.toLowerCase() }, include: { role: true } });
  return !!account && account.status === "active" && rolePermissions(account.role).includes("mcp.manage");
}

/** Jeton d'accès reçu par le point d'accès MCP : signé, pas expiré, génération actuelle, compte autorisé. */
export async function checkAccessToken(raw: string, setup: OauthSetup): Promise<{ ok: true; email: string } | { ok: false }> {
  const v = readAccess(raw, setup.key);
  if (!v) return { ok: false };
  const state = await getOauthState();
  if (v.generation !== state.generation) return { ok: false };
  if (!(await accountMayUseMcp(v.email))) return { ok: false };
  return { ok: true, email: v.email };
}
