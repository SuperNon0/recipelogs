import { createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";

/**
 * Vérification du jeton de Cloudflare Access.
 *
 * Cloudflare ajoute à chaque requête qu'il laisse passer un jeton signé
 * (en-tête `Cf-Access-Jwt-Assertion`, ou cookie `CF_Authorization`). On le
 * vérifie avec les clés publiques de l'équipe Cloudflare au lieu de croire
 * l'en-tête `Cf-Access-Authenticated-User-Email` : le serveur est aussi
 * joignable sur le réseau local, où n'importe qui pourrait écrire cet en-tête.
 */

export type CloudflareConfig = { team: string; aud: string };

export type JwtCheck =
  | { ok: true; email: string }
  | { ok: false; error: string };

type Jwk = JsonWebKey & { kid?: string };
type KeyFetcher = (team: string) => Promise<Jwk[]>;

/** « monequipe », « monequipe.cloudflareaccess.com » ou l'adresse complète → « monequipe ». */
export function normalizeTeam(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.cloudflareaccess\.com$/, "");
}

export function teamIssuer(team: string): string {
  return `https://${normalizeTeam(team)}.cloudflareaccess.com`;
}

function b64urlJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const KEY_TTL_MS = 60 * 60 * 1000;
const keyCache = new Map<string, { at: number; keys: Jwk[] }>();

const fetchTeamKeys: KeyFetcher = async (team) => {
  // Développement seulement : clés servies localement pour tester les comptes sans Cloudflare.
  const devUrl = process.env.NODE_ENV !== "production" ? process.env.RECIPELOG_DEV_CERTS_URL : undefined;
  const res = await fetch(devUrl || `${teamIssuer(team)}/cdn-cgi/access/certs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`clés Cloudflare introuvables (HTTP ${res.status})`);
  const body = (await res.json()) as { keys?: Jwk[] };
  return Array.isArray(body.keys) ? body.keys : [];
};

async function keysFor(team: string, kid: string, fetcher: KeyFetcher): Promise<Jwk | null> {
  const cached = keyCache.get(team);
  const fresh = cached && Date.now() - cached.at < KEY_TTL_MS;
  let key = cached?.keys.find((k) => k.kid === kid);
  // Clé inconnue : Cloudflare a peut-être changé de clé, on relit la liste.
  if (!key || !fresh) {
    const keys = await fetcher(team);
    keyCache.set(team, { at: Date.now(), keys });
    key = keys.find((k) => k.kid === kid);
  }
  return key ?? null;
}

/** Vide le cache des clés (tests, ou après un changement d'équipe). */
export function clearKeyCache(): void {
  keyCache.clear();
}

/**
 * Vérifie le jeton : signature RS256 par une clé de l'équipe, émetteur,
 * audience (l'« AUD » de l'application Cloudflare), dates. Renvoie l'e-mail.
 */
export async function verifyCloudflareJwt(
  token: string,
  config: CloudflareConfig,
  opts: { fetchKeys?: KeyFetcher; now?: number } = {},
): Promise<JwtCheck> {
  const team = normalizeTeam(config.team);
  const aud = config.aud.trim();
  if (!team || !aud) return { ok: false, error: "Équipe ou AUD Cloudflare non renseignés." };

  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "Jeton mal formé." };
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (!header || !payload) return { ok: false, error: "Jeton illisible." };
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    return { ok: false, error: "Type de signature inattendu." };
  }

  let jwk: Jwk | null;
  try {
    jwk = await keysFor(team, header.kid, opts.fetchKeys ?? fetchTeamKeys);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (!jwk) return { ok: false, error: "Jeton signé par une clé inconnue de cette équipe." };

  let valid = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    valid = verifySignature(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      key,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: "Signature invalide." };

  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const leeway = 60;
  if (typeof payload.exp === "number" && payload.exp + leeway < now) {
    return { ok: false, error: "Jeton expiré." };
  }
  if (typeof payload.nbf === "number" && payload.nbf - leeway > now) {
    return { ok: false, error: "Jeton pas encore valable." };
  }
  if (payload.iss !== teamIssuer(team)) return { ok: false, error: "Jeton d'une autre équipe Cloudflare." };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) return { ok: false, error: "Jeton d'une autre application Cloudflare (AUD)." };

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email) return { ok: false, error: "Jeton sans adresse e-mail (jeton de service ?)." };
  return { ok: true, email };
}

/** Jeton Cloudflare de la requête : en-tête, sinon cookie. */
export function tokenFromRequest(headerValue: string | null, cookieValue: string | undefined): string | null {
  const t = (headerValue ?? cookieValue ?? "").trim();
  return t || null;
}
