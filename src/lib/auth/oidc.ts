import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
  type JsonWebKey,
} from "node:crypto";
import http from "node:http";
import https from "node:https";

/**
 * Connexion par Authentik (OpenID Connect), mode « plateforme »
 * (RECIPELOG_AUTH_MODE=oidc). Contrat : plateforme/connexion.md.
 *
 * Code d'autorisation + PKCE (S256) + state + nonce. L'id_token est vérifié
 * ici (RS256 avec les clés jwks_uri, émetteur, audience, dates, nonce) : on
 * n'ajoute aucune dépendance, comme pour cloudflare.ts.
 */

export type OidcConfig = {
  /** Émetteur public, avec la barre finale (https://auth.recipelog.cc/application/o/rl-chanka/). */
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Adresse publique du site (https://chanka.recipelog.cc), sans barre finale. */
  appUrl: string;
  /** Origine interne pour les appels du serveur (http://recipelog-authentik:9000), facultative. */
  internal: string | null;
};

export type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};

export type Jwk = JsonWebKey & { kid?: string };
export type KeyFetcher = (jwksUri: string) => Promise<Jwk[]>;

export type IdTokenCheck = { ok: true; email: string } | { ok: false; error: string };

/** Réglages lus dans l'environnement ; null s'il en manque un (message dans `missing`). */
export function oidcConfig(env: NodeJS.ProcessEnv = process.env): OidcConfig | null {
  return oidcConfigCheck(env).config;
}

export function oidcConfigCheck(env: NodeJS.ProcessEnv = process.env): { config: OidcConfig | null; missing: string[] } {
  const issuer = (env.OIDC_ISSUER ?? "").trim();
  const clientId = (env.OIDC_CLIENT_ID ?? "").trim();
  const clientSecret = (env.OIDC_CLIENT_SECRET ?? "").trim();
  const appUrl = (env.RECIPELOG_URL ?? "").trim().replace(/\/+$/, "");
  const internal = (env.OIDC_INTERNE ?? "").trim().replace(/\/+$/, "") || null;
  const missing = [
    !issuer && "OIDC_ISSUER",
    !clientId && "OIDC_CLIENT_ID",
    !clientSecret && "OIDC_CLIENT_SECRET",
    !appUrl && "RECIPELOG_URL",
  ].filter((x): x is string => !!x);
  return { config: missing.length ? null : { issuer, clientId, clientSecret, appUrl, internal }, missing };
}

export function redirectUri(config: Pick<OidcConfig, "appUrl">): string {
  return `${config.appUrl}/auth/retour`;
}

export function discoveryUrl(issuer: string): string {
  return `${issuer.endsWith("/") ? issuer : `${issuer}/`}.well-known/openid-configuration`;
}

// ── Appels faits par le serveur ─────────────────────────────

/**
 * Adresse réellement appelée par le serveur : avec OIDC_INTERNE, l'origine
 * publique est remplacée par l'origine interne, et l'en-tête Host garde le
 * nom public (Authentik répond alors avec ses adresses publiques).
 */
export function internalTarget(publicUrl: string, internal: string | null): { url: string; headers: Record<string, string> } {
  if (!internal) return { url: publicUrl, headers: {} };
  const pub = new URL(publicUrl);
  const inner = new URL(internal);
  const url = new URL(pub.pathname + pub.search, inner.origin);
  // Un préfixe éventuel dans OIDC_INTERNE (http://hote:9000/sous-dossier) est gardé.
  if (inner.pathname !== "/") url.pathname = inner.pathname.replace(/\/+$/, "") + pub.pathname;
  return { url: url.toString(), headers: { Host: pub.host, "X-Forwarded-Proto": "https" } };
}

export type ServerResponse = { status: number; body: unknown };
export type ServerFetcher = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<ServerResponse>;

const TIMEOUT_MS = 8000;

/**
 * Requête HTTP(S) du serveur. node:http plutôt que fetch : fetch (undici)
 * ignore l'en-tête Host, indispensable avec OIDC_INTERNE.
 */
export const nodeRequest: ServerFetcher = (url, init) =>
  new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const body = init.body;
    const req = lib.request(
      u,
      {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
          ...init.headers,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            /* réponse non JSON : gardée en texte */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Authentik ne répond pas (délai dépassé).")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });

/** Appel du serveur vers Authentik, en passant par OIDC_INTERNE s'il est réglé. */
export function serverCall(
  config: Pick<OidcConfig, "internal">,
  publicUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  fetcher: ServerFetcher = nodeRequest,
): Promise<ServerResponse> {
  const target = internalTarget(publicUrl, config.internal);
  return fetcher(target.url, { ...init, headers: { ...target.headers, ...init.headers } });
}

// ── Découverte et clés (gardées en mémoire) ─────────────────

const TTL_MS = 60 * 60 * 1000;
const discoveryCache = new Map<string, { at: number; value: Discovery }>();
const keyCache = new Map<string, { at: number; keys: Jwk[] }>();

export function clearOidcCache(): void {
  discoveryCache.clear();
  keyCache.clear();
}

export async function discover(config: OidcConfig, fetcher: ServerFetcher = nodeRequest): Promise<Discovery> {
  const cached = discoveryCache.get(config.issuer);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const res = await serverCall(config, discoveryUrl(config.issuer), {}, fetcher);
  const d = res.body as Partial<Discovery> | null;
  if (res.status !== 200 || !d || typeof d !== "object") {
    throw new Error(`Authentik introuvable (découverte, HTTP ${res.status}).`);
  }
  if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) {
    throw new Error("Réponse de découverte d'Authentik incomplète.");
  }
  const value: Discovery = {
    issuer: String(d.issuer ?? ""),
    authorization_endpoint: d.authorization_endpoint,
    token_endpoint: d.token_endpoint,
    jwks_uri: d.jwks_uri,
    end_session_endpoint: d.end_session_endpoint || undefined,
  };
  discoveryCache.set(config.issuer, { at: Date.now(), value });
  return value;
}

/** Lecteur de clés par défaut : jwks_uri, appelé par le serveur (OIDC_INTERNE si réglé). */
export function jwksFetcher(config: Pick<OidcConfig, "internal">, fetcher: ServerFetcher = nodeRequest): KeyFetcher {
  return async (jwksUri) => {
    const res = await serverCall(config, jwksUri, {}, fetcher);
    if (res.status !== 200) throw new Error(`Clés d'Authentik introuvables (HTTP ${res.status}).`);
    const keys = (res.body as { keys?: Jwk[] } | null)?.keys;
    return Array.isArray(keys) ? keys : [];
  };
}

async function keyFor(jwksUri: string, kid: string | undefined, fetcher: KeyFetcher): Promise<Jwk | null> {
  const match = (keys: Jwk[]) =>
    kid ? keys.find((k) => k.kid === kid) : keys.length === 1 ? keys[0] : undefined;
  const cached = keyCache.get(jwksUri);
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  let key = cached ? match(cached.keys) : undefined;
  // Clé inconnue : Authentik a peut-être changé de clé, on relit la liste.
  if (!key || !fresh) {
    const keys = await fetcher(jwksUri);
    keyCache.set(jwksUri, { at: Date.now(), keys });
    key = match(keys);
  }
  return key ?? null;
}

// ── PKCE, state, nonce ──────────────────────────────────────

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function authorizeUrl(
  discovery: Pick<Discovery, "authorization_endpoint">,
  config: OidcConfig,
  p: { state: string; nonce: string; verifier: string },
): string {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri(config));
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", p.state);
  url.searchParams.set("nonce", p.nonce);
  url.searchParams.set("code_challenge", pkceChallenge(p.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/** Échange le code contre les jetons (authentification client « basic »). Renvoie l'id_token. */
export async function exchangeCode(
  discovery: Pick<Discovery, "token_endpoint">,
  config: OidcConfig,
  code: string,
  verifier: string,
  fetcher: ServerFetcher = nodeRequest,
): Promise<{ ok: true; idToken: string } | { ok: false; error: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(config),
    code_verifier: verifier,
  }).toString();
  // RFC 6749 §2.3.1 : identifiant et secret encodés (form-urlencoded) avant base64.
  const basic = Buffer.from(
    `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`,
  ).toString("base64");
  let res: ServerResponse;
  try {
    res = await serverCall(
      config,
      discovery.token_endpoint,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
        body,
      },
      fetcher,
    );
  } catch (e) {
    return { ok: false, error: `Authentik ne répond pas : ${e instanceof Error ? e.message : String(e)}` };
  }
  const b = (res.body ?? {}) as { id_token?: unknown; error?: unknown; error_description?: unknown };
  if (res.status !== 200 || typeof b.id_token !== "string") {
    const why = typeof b.error_description === "string" ? b.error_description : typeof b.error === "string" ? b.error : `HTTP ${res.status}`;
    return { ok: false, error: `Authentik a refusé le code de connexion (${why}).` };
  }
  return { ok: true, idToken: b.id_token };
}

// ── Vérification de l'id_token ──────────────────────────────

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Vérifie l'id_token : signature RS256 par une clé de jwks_uri, iss égal à
 * OIDC_ISSUER (exactement), aud contenant l'identifiant du client, dates
 * (60 s de marge), nonce. Renvoie l'e-mail en minuscules.
 */
export async function verifyIdToken(
  token: string,
  expected: { issuer: string; clientId: string; nonce: string; jwksUri: string },
  opts: { fetchKeys: KeyFetcher; now?: number },
): Promise<IdTokenCheck> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Jeton de connexion mal formé." };
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (!header || !payload) return { ok: false, error: "Jeton de connexion illisible." };
  if (header.alg !== "RS256") return { ok: false, error: "Type de signature inattendu." };

  let jwk: Jwk | null;
  try {
    jwk = await keyFor(expected.jwksUri, typeof header.kid === "string" ? header.kid : undefined, opts.fetchKeys);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!jwk) return { ok: false, error: "Jeton signé par une clé inconnue." };

  let valid = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    valid = verifySignature("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "Signature invalide." };

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const leeway = 60;
  if (typeof payload.exp !== "number" || payload.exp + leeway < now) return { ok: false, error: "Jeton de connexion expiré." };
  if (typeof payload.nbf === "number" && payload.nbf - leeway > now) return { ok: false, error: "Jeton pas encore valable." };
  if (payload.iss !== expected.issuer) return { ok: false, error: "Jeton d'un autre émetteur." };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(expected.clientId)) return { ok: false, error: "Jeton destiné à une autre application." };
  if (typeof payload.nonce !== "string" || payload.nonce !== expected.nonce) {
    return { ok: false, error: "Jeton de connexion rejoué ou d'une autre tentative (nonce)." };
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) return { ok: false, error: "Jeton sans adresse e-mail." };
  return { ok: true, email };
}

// ── Chemin de retour après connexion ────────────────────────

/** Garde seulement un chemin du site (« /recettes?x=1 ») ; tout le reste devient « / ». */
export function safeReturnPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (raw.length > 2000) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  // Caractères de contrôle (dont tabulation et retour à la ligne) : refusés.
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  try {
    const u = new URL(raw, "https://recipelog.invalid");
    if (u.origin !== "https://recipelog.invalid") return "/";
    // Pas de retour vers les routes de connexion elles-mêmes (boucle).
    if (u.pathname.startsWith("/auth/")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
