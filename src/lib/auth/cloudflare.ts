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

export type CfTestResult = {
  ok: boolean;
  teamDomainOk: boolean;
  jwksReachable: boolean;
  jwksKeyCount: number;
  audValid: boolean;
  error: string | null;
};

/**
 * Teste une configuration CF DONNÉE (pas celle en base) — utilisé par le
 * bouton « Tester » du formulaire /settings pour valider les valeurs avant
 * enregistrement.
 *
 * Vérifie :
 *  1. Format du team domain (host valide)
 *  2. Téléchargement des clés publiques (/cdn-cgi/access/certs)
 *  3. Présence de clés dans le JWKS
 *  4. Format basique de l'AUD (32-64 hex chars ; longueur/format uniquement,
 *     on ne peut pas confirmer qu'il correspond réellement à l'app sans un
 *     vrai token à valider).
 */
export async function cfTestConfig(input: {
  teamDomain: string;
  aud: string;
}): Promise<CfTestResult> {
  const teamDomain = input.teamDomain.trim().toLowerCase();
  const aud = input.aud.trim();

  const result: CfTestResult = {
    ok: false,
    teamDomainOk: false,
    jwksReachable: false,
    jwksKeyCount: 0,
    audValid: false,
    error: null,
  };

  if (!teamDomain) {
    result.error = "Team domain vide.";
    return result;
  }
  // Format hôte simplifié : quelque-chose.cloudflareaccess.com ou tout host valide
  if (!/^[a-z0-9](?:[a-z0-9-.]*[a-z0-9])?$/.test(teamDomain)) {
    result.error = "Team domain invalide (format hôte attendu).";
    return result;
  }
  result.teamDomainOk = true;

  // AUD : 32-64 hex chars typique CF
  result.audValid = /^[a-f0-9]{16,128}$/i.test(aud);
  if (!result.audValid) {
    result.error = "AUD invalide (attendu : 16-128 caractères hexadécimaux).";
    // On continue quand même pour tester le team domain.
  }

  try {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      result.error = result.error ?? `Clés publiques inaccessibles (HTTP ${res.status}).`;
      return result;
    }
    result.jwksReachable = true;
    try {
      const data = await res.json();
      const keys = Array.isArray(data?.keys) ? data.keys : [];
      result.jwksKeyCount = keys.length;
      if (keys.length === 0) {
        result.error = result.error ?? "Aucune clé publique renvoyée par Cloudflare.";
        return result;
      }
    } catch {
      result.error = result.error ?? "Réponse JWKS invalide (JSON incorrect).";
      return result;
    }
  } catch (e) {
    result.error = result.error ?? (e instanceof Error ? e.message : String(e));
    return result;
  }

  result.ok = result.teamDomainOk && result.jwksReachable && result.jwksKeyCount > 0 && result.audValid;
  return result;
}

/**
 * Diagnostic pour /settings. Utilise la config actuellement enregistrée
 * (AppSetting/env). Sert au DiagnosticPanel qui reste séparé.
 */
export async function cfDiagnostic(): Promise<{
  teamDomain: string;
  aud: string;
  verifyJwt: boolean;
  jwksReachable: boolean;
  ok: boolean;
  message: string | null;
  error: string | null;
}> {
  const cfg = await getCfConfig();
  if (!cfg.teamDomain) {
    return {
      teamDomain: "",
      aud: cfg.aud,
      verifyJwt: cfg.verifyJwt,
      jwksReachable: false,
      ok: false,
      message: "Non configuré",
      error: "CF_TEAM_DOMAIN non renseigné.",
    };
  }
  const test = await cfTestConfig({ teamDomain: cfg.teamDomain, aud: cfg.aud });
  return {
    teamDomain: cfg.teamDomain,
    aud: cfg.aud,
    verifyJwt: cfg.verifyJwt,
    jwksReachable: test.jwksReachable,
    ok: test.ok,
    message: test.ok
      ? `Clés OK (${test.jwksKeyCount} clés), AUD valide`
      : test.error,
    error: test.error,
  };
}
