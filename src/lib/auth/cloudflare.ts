/**
 * Cloudflare Access — vérification du JWT `Cf-Access-Jwt-Assertion`.
 *
 * ⚠️ Sécurité : ne JAMAIS faire confiance à l'en-tête
 * `Cf-Access-Authenticated-User-Email` si l'origine est joignable hors
 * Cloudflare. Quand `CF_VERIFY_JWT=true`, on vérifie la signature du JWT
 * contre les clés publiques de l'équipe (`/cdn-cgi/access/certs`),
 * l'audience (`aud`) et l'émetteur (`iss`).
 *
 * Config lue via `getCfConfig()` : AppSetting > .env > défaut. La priorité
 * AppSetting permet à l'admin de reconfigurer CF depuis /settings sans
 * toucher au fichier .env ni redémarrer.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { prisma } from "@/lib/prisma";

export type CfConfig = {
  teamDomain: string; // ex. « super-nono.cloudflareaccess.com »
  aud: string;
  verifyJwt: boolean;
};

const CF_CONFIG_KEY = "cfConfig";

type StoredCfConfig = Partial<{
  teamDomain: string;
  aud: string;
  verifyJwt: boolean;
}>;

/** Cache JWKS par team domain (les clés publiques sont volumineuses). */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    const url = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
    jwks = createRemoteJWKSet(url);
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

/**
 * Lit la config CF : AppSetting prioritaire, sinon .env, sinon défaut.
 */
export async function getCfConfig(): Promise<CfConfig> {
  let stored: StoredCfConfig | null = null;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: CF_CONFIG_KEY } });
    if (row && row.value && typeof row.value === "object" && !Array.isArray(row.value)) {
      stored = row.value as StoredCfConfig;
    }
  } catch {
    // AppSetting absent (avant migration) : on retombe sur .env.
    stored = null;
  }

  const teamDomain = (stored?.teamDomain ?? process.env.CF_TEAM_DOMAIN ?? "").trim();
  const aud = (stored?.aud ?? process.env.CF_AUD ?? "").trim();
  const verifyJwt =
    typeof stored?.verifyJwt === "boolean"
      ? stored.verifyJwt
      : String(process.env.CF_VERIFY_JWT ?? "false").toLowerCase() === "true";

  return { teamDomain, aud, verifyJwt };
}

export async function saveCfConfig(cfg: CfConfig): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: CF_CONFIG_KEY },
    update: { value: cfg },
    create: { key: CF_CONFIG_KEY, value: cfg },
  });
  // Invalider le cache JWKS (le team peut avoir changé).
  jwksCache.clear();
}

function cfTokenFromRequest(request: Request): string | null {
  const header = request.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  // Cookie CF_Authorization (défini par Cloudflare Access).
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === "CF_Authorization") return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/**
 * Vérifie le JWT CF de la requête. Retourne l'email ou null (échec / absent).
 */
export async function verifyCfJwt(request: Request): Promise<{ email: string } | null> {
  const cfg = await getCfConfig();
  if (!cfg.verifyJwt) {
    // Mode dev : on lit l'en-tête sans vérification.
    const header = request.headers.get("Cf-Access-Authenticated-User-Email");
    const email = (header ?? "").trim().toLowerCase();
    return email ? { email } : null;
  }

  if (!cfg.teamDomain || !cfg.aud) return null;

  const token = cfTokenFromRequest(request);
  if (!token) return null;

  try {
    const jwks = getJwks(cfg.teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      audience: cfg.aud,
      issuer: `https://${cfg.teamDomain}`,
    });
    const email = extractEmail(payload);
    return email ? { email } : null;
  } catch {
    return null;
  }
}

function extractEmail(payload: JWTPayload): string | null {
  const raw = payload["email"];
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email || null;
}

/** Shortcut : l'email CF vérifié pour la requête, ou null. */
export async function getCfEmail(request: Request): Promise<string | null> {
  const res = await verifyCfJwt(request);
  return res?.email ?? null;
}

/**
 * Diagnostic pour /settings. Tente juste de télécharger les clés publiques
 * et ne fait pas planter la page si CF n'est pas configuré.
 */
export async function cfDiagnostic(): Promise<{
  teamDomain: string;
  aud: string;
  verifyJwt: boolean;
  jwksReachable: boolean;
  error: string | null;
}> {
  const cfg = await getCfConfig();
  const diag = {
    teamDomain: cfg.teamDomain,
    aud: cfg.aud,
    verifyJwt: cfg.verifyJwt,
    jwksReachable: false,
    error: null as string | null,
  };
  if (!cfg.teamDomain) {
    diag.error = "CF_TEAM_DOMAIN non renseigné.";
    return diag;
  }
  try {
    const res = await fetch(`https://${cfg.teamDomain}/cdn-cgi/access/certs`, {
      cache: "no-store",
      // Timeout court : ne bloque pas la page /settings.
      signal: AbortSignal.timeout(3000),
    });
    diag.jwksReachable = res.ok;
    if (!res.ok) diag.error = `HTTP ${res.status}`;
  } catch (e) {
    diag.error = e instanceof Error ? e.message : String(e);
  }
  return diag;
}
